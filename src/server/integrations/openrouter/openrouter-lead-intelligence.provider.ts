import OpenAI from 'openai';

import type { AppConfig } from '../../runtime/config';
import {
  LeadIntelligenceProviderError,
  type LeadIntelligenceInput,
  type LeadIntelligenceProvider,
  type LeadIntelligenceResult,
} from './lead-intelligence.provider';
import {
  extractOpenRouterMessageText,
  parseOpenRouterResponse,
} from './openrouter-response.parser';

const REQUEST_TIMEOUT_MS = 30_000;

export class OpenRouterLeadIntelligenceProvider implements LeadIntelligenceProvider {
  public constructor(private readonly config: AppConfig) {}

  public async extractLead(input: LeadIntelligenceInput): Promise<LeadIntelligenceResult> {
    const apiKey = this.config.OPENROUTER_API_KEY;
    if (apiKey === undefined) {
      throw new LeadIntelligenceProviderError(
        'PROVIDER_CONFIGURATION',
        'OpenRouter API key is not configured',
      );
    }
    const models = [
      this.config.OPENROUTER_MODEL,
      ...(this.config.OPENROUTER_FALLBACK_MODELS ?? '')
        .split(',')
        .map((model: string) => model.trim())
        .filter((model: string) => model.length > 0),
    ];
    let lastError: unknown;
    for (const model of models) {
      try {
        return await this.callModel(apiKey, model, input);
      } catch (error) {
        lastError = error;
        if (!this.isFallbackEligible(error)) {
          throw error;
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new LeadIntelligenceProviderError('PROVIDER_UNAVAILABLE', 'OpenRouter request failed');
  }

  private async callModel(
    apiKey: string,
    model: string,
    input: LeadIntelligenceInput,
  ): Promise<LeadIntelligenceResult> {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      timeout: REQUEST_TIMEOUT_MS,
      defaultHeaders: {
        'HTTP-Referer': 'https://bestairbnb.example',
        'X-Title': 'BestAirbnb take-home',
      },
    });
    try {
      let response: OpenAI.Chat.Completions.ChatCompletion;
      try {
        response = await this.request(client, model, input, false);
      } catch (error) {
        if (!this.isResponseFormatCompatibilityError(error)) throw error;
        response = await this.request(client, model, input, true);
      }
      try {
        return parseOpenRouterResponse(response, model);
      } catch (error) {
        if (
          !(error instanceof LeadIntelligenceProviderError) ||
          error.code !== 'PROVIDER_INVALID_RESPONSE'
        ) {
          throw error;
        }
        response = await this.request(
          client,
          model,
          input,
          true,
          extractOpenRouterMessageText(response) ?? undefined,
        );
        return parseOpenRouterResponse(response, model);
      }
    } catch (error) {
      if (error instanceof LeadIntelligenceProviderError) {
        throw error;
      }
      if (error instanceof OpenAI.APIError) {
        const code =
          error.status === 408 || error.status === 429
            ? 'PROVIDER_TIMEOUT'
            : 'PROVIDER_UNAVAILABLE';
        throw new LeadIntelligenceProviderError(code, 'OpenRouter request failed', {
          cause: error,
        });
      }
      throw new LeadIntelligenceProviderError('PROVIDER_UNAVAILABLE', 'OpenRouter request failed', {
        cause: error,
      });
    }
  }

  private async request(
    client: OpenAI,
    model: string,
    input: LeadIntelligenceInput,
    repair: boolean,
    previousOutput?: string,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    try {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: repair
            ? 'Extract the lead again. Return only one valid JSON object with exactly contactEmail, contactName, propertyAddress, confidence. propertyAddress must be an object with exactly country, city, street, houseNumber, unit, postcode. Use null for any missing address component. Do not use markdown or commentary. Use null for missing contact values and a confidence number from 0 to 1.'
            : 'Extract lead contact and property data. Return only one JSON object with exactly contactEmail, contactName, propertyAddress, confidence. propertyAddress must be an object with exactly country, city, street, houseNumber, unit, postcode. Use null for any missing address component. Use null for missing contact values and a confidence number from 0 to 1.',
        },
        { role: 'user', content: input.conversation.slice(0, 20_000) },
      ];
      if (repair && previousOutput !== undefined) {
        messages.push({ role: 'assistant', content: previousOutput.slice(0, 12_000) });
        messages.push({
          role: 'user',
          content:
            'The previous assistant output was not usable. Return the corrected JSON object only, using null for missing values.',
        });
      }
      return await client.chat.completions.create({
        model,
        temperature: 0,
        ...(repair ? {} : { response_format: { type: 'json_object' as const } }),
        messages,
      });
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        const code =
          error.status === 408 || error.status === 429
            ? 'PROVIDER_TIMEOUT'
            : 'PROVIDER_UNAVAILABLE';
        throw new LeadIntelligenceProviderError(code, 'OpenRouter request failed', {
          cause: error,
        });
      }
      throw new LeadIntelligenceProviderError('PROVIDER_UNAVAILABLE', 'OpenRouter request failed', {
        cause: error,
      });
    }
  }

  private isFallbackEligible(error: unknown): boolean {
    return (
      error instanceof LeadIntelligenceProviderError &&
      (error.code === 'PROVIDER_TIMEOUT' ||
        error.code === 'PROVIDER_UNAVAILABLE' ||
        error.code === 'PROVIDER_INVALID_RESPONSE')
    );
  }

  private isResponseFormatCompatibilityError(error: unknown): boolean {
    if (
      !(error instanceof LeadIntelligenceProviderError) ||
      error.code !== 'PROVIDER_UNAVAILABLE'
    ) {
      return false;
    }
    const cause = error.cause;
    if (!(cause instanceof OpenAI.APIError) || (cause.status !== 400 && cause.status !== 422)) {
      return false;
    }
    return /response.?format|json_object|unsupported|not support/i.test(cause.message);
  }
}
