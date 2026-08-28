import { render } from '@react-email/render';
import { ShowcaseEmail, type ShowcaseContent } from '@/emails';
import { createElement } from 'react';

export class ShowcaseRendererService {
  public render(content: ShowcaseContent): Promise<string> {
    return render(createElement(ShowcaseEmail, { content }));
  }
}
