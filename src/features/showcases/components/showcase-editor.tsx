import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';

import type { ShowcaseContent } from '../../../api/leads';

interface ShowcaseFormValues {
  subject: string;
  greeting: string;
  propertySummary: string;
  selectedServices: { value: string }[];
  observations: { value: string }[];
  callToAction: string;
  masterDataWarning: string;
}

export function ShowcaseEditor({
  content,
  saving,
  disabled,
  onSave,
}: {
  readonly content: ShowcaseContent | null;
  readonly saving: boolean;
  readonly disabled?: boolean;
  readonly onSave: (content: ShowcaseContent) => void;
}): React.JSX.Element {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<ShowcaseFormValues>({ defaultValues: toFormValues(content) });
  const services = useFieldArray({ control, name: 'selectedServices' });
  const observations = useFieldArray({ control, name: 'observations' });
  useEffect(() => {
    if (!isDirty) reset(toFormValues(content));
  }, [content, isDirty, reset]);
  return (
    <form
      className="showcase-editor"
      onSubmit={handleSubmit((values) => onSave(toContent(values)))}
    >
      <div className="form-field">
        <label htmlFor="showcase-subject">Subject</label>
        <input
          id="showcase-subject"
          {...register('subject', { required: true })}
          disabled={disabled}
        />
      </div>
      <div className="form-field">
        <label htmlFor="showcase-greeting">Greeting</label>
        <input
          id="showcase-greeting"
          {...register('greeting', { required: true })}
          disabled={disabled}
        />
      </div>
      <div className="form-field">
        <label htmlFor="showcase-summary">Property summary</label>
        <textarea
          id="showcase-summary"
          rows={3}
          {...register('propertySummary', { required: true })}
          disabled={disabled}
        />
      </div>
      <ArrayEditor
        label="Selected services"
        items={services.fields}
        register={register}
        fieldName="selectedServices"
        onAdd={() => services.append({ value: '' })}
        onRemove={(index) => services.remove(index)}
        disabled={disabled}
      />
      <ArrayEditor
        label="Observations"
        items={observations.fields}
        register={register}
        fieldName="observations"
        onAdd={() => observations.append({ value: '' })}
        onRemove={(index) => observations.remove(index)}
        disabled={disabled}
      />
      <div className="form-field">
        <label htmlFor="showcase-cta">Call to action</label>
        <textarea
          id="showcase-cta"
          rows={2}
          {...register('callToAction', { required: true })}
          disabled={disabled}
        />
      </div>
      <div className="form-field">
        <label htmlFor="showcase-warning">
          Master-data note <span>(optional)</span>
        </label>
        <textarea
          id="showcase-warning"
          rows={2}
          {...register('masterDataWarning')}
          disabled={disabled}
        />
      </div>
      <button className="button button-primary" type="submit" disabled={disabled || saving}>
        {saving ? 'Saving changes...' : 'Save showcase'}
      </button>
    </form>
  );
}

function ArrayEditor({
  label,
  items,
  register,
  fieldName,
  onAdd,
  onRemove,
  disabled,
}: {
  readonly label: string;
  readonly items: readonly { id: string }[];
  readonly register: ReturnType<typeof useForm<ShowcaseFormValues>>['register'];
  readonly fieldName: 'selectedServices' | 'observations';
  readonly onAdd: () => void;
  readonly onRemove: (index: number) => void;
  readonly disabled?: boolean;
}): React.JSX.Element {
  return (
    <fieldset className="array-editor">
      <legend>{label}</legend>
      {items.map((item, index) => (
        <div className="array-row" key={item.id}>
          <input
            aria-label={`${label} ${index + 1}`}
            {...register(`${fieldName}.${index}.value` as const, { required: true })}
            disabled={disabled}
          />
          <button
            className="icon-button"
            type="button"
            aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
            onClick={() => onRemove(index)}
            disabled={disabled || items.length <= 1}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="button button-quiet button-small"
        type="button"
        onClick={onAdd}
        disabled={disabled || items.length >= 10}
      >
        + Add item
      </button>
    </fieldset>
  );
}

function toFormValues(content: ShowcaseContent | null): ShowcaseFormValues {
  return {
    subject: content?.subject ?? '',
    greeting: content?.greeting ?? '',
    propertySummary: content?.propertySummary ?? '',
    selectedServices: content?.selectedServices.map((value) => ({ value })) ?? [{ value: '' }],
    observations: content?.observations.map((value) => ({ value })) ?? [{ value: '' }],
    callToAction: content?.callToAction ?? '',
    masterDataWarning: content?.masterDataWarning ?? '',
  };
}

function toContent(values: ShowcaseFormValues): ShowcaseContent {
  const content: ShowcaseContent = {
    subject: values.subject.trim(),
    greeting: values.greeting.trim(),
    propertySummary: values.propertySummary.trim(),
    selectedServices: values.selectedServices.map(({ value }) => value.trim()).filter(Boolean),
    observations: values.observations.map(({ value }) => value.trim()).filter(Boolean),
    callToAction: values.callToAction.trim(),
  };
  if (values.masterDataWarning.trim().length > 0)
    return { ...content, masterDataWarning: values.masterDataWarning.trim() };
  return content;
}
