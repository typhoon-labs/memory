/**
 * The catalog the card is rendered with, and how this app draws it: the
 * incident catalog (./incident-catalog.ts), which is A2UI's basic catalog and
 * four components of this app's own.
 *
 * Of the basic catalog, the five components the card uses are drawn here, in
 * the look of the rest of the page. The components of @a2ui/react 0.12.0 carry
 * their styles inline and are published without their CSS-module class names,
 * so a stylesheet cannot restyle them; custom implementations of catalog
 * components are the renderer's documented extension point. Each one takes
 * the schema of the official component (`TextApi`, `ButtonApi`, ...), so it
 * gets the same resolved properties and does what the official one does. Two
 * choices are this app's: a text field shows its label inside the field, and a
 * disabled button keeps the reason it is disabled as its tooltip.
 *
 * The four of this app's own (Steps, Step, Badge, Notice) exist only here.
 */
import { basicCatalog as official, createComponentImplementation, type ReactComponentImplementation } from '@a2ui/react/v0_9';
import { ButtonApi, ColumnApi, RowApi, TextApi, TextFieldApi } from '@a2ui/web_core/v0_9/basic_catalog';
import { CheckIcon, ExternalLinkIcon, XIcon } from 'lucide-react';
import { Fragment, useId, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { Callout } from './Callout';
import { BadgeApi, NoticeApi, StepApi, StepsApi, incidentCatalog } from './incident-catalog';
import { Markdown } from './markdown';
import { Button as UiButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const JUSTIFY: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  spaceAround: 'space-around',
  spaceBetween: 'space-between',
  spaceEvenly: 'space-evenly',
  stretch: 'stretch',
};
const ALIGN: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };

/** `weight` is the share of its row or column that a component takes. */
const weighted = (weight: unknown): CSSProperties => (typeof weight === 'number' ? { flex: `${weight}`, minWidth: 0, minHeight: 0 } : {});

const placed = (props: { weight?: unknown; justify?: unknown; align?: unknown }): CSSProperties => ({
  ...weighted(props.weight),
  justifyContent: JUSTIFY[String(props.justify)] ?? 'flex-start',
  alignItems: ALIGN[String(props.align)] ?? 'stretch',
});

type ChildRef = string | { id: string; basePath?: string };

function childrenOf(list: unknown, buildChild: (id: string, basePath?: string) => ReactNode) {
  if (!Array.isArray(list)) return null;
  return (list as ChildRef[]).map((child, index) =>
    typeof child === 'string' ? (
      <Fragment key={`${child}-${index}`}>{buildChild(child)}</Fragment>
    ) : (
      <Fragment key={`${child.id}-${child.basePath}`}>{buildChild(child.id, child.basePath)}</Fragment>
    ),
  );
}

// ---------------------------------------------------------------------------
// The basic catalog's components that the card uses
// ---------------------------------------------------------------------------

// The card uses h3 for its title, h4 for a figure and h5 to head a section. The space above a
// section is its heading's: the card is one column with one gap.
const HEADING = {
  h1: 'text-3xl font-semibold tracking-tight',
  h2: 'text-2xl font-semibold tracking-tight',
  h3: 'text-2xl leading-tight font-semibold tracking-[-0.022em]',
  h4: '-mb-2 text-2xl font-semibold tabular-nums',
  h5: 'mt-6 text-base font-semibold tracking-[-0.01em]',
} as const;

const Text = createComponentImplementation(TextApi, ({ props }) => {
  const text = typeof props.text === 'string' ? props.text : String(props.text ?? '');
  // A text that is empty for now (the evidence heading, a timeline entry without a time) takes no room.
  if (!text) return null;
  const style = weighted(props.weight);
  const variant = props.variant;
  if (variant === 'caption') {
    return (
      <span className="block text-sm leading-[1.6] text-muted-foreground tabular-nums" style={style}>
        {text}
      </span>
    );
  }
  if (variant && variant in HEADING) {
    const Heading = variant as keyof typeof HEADING;
    return (
      <Heading className={HEADING[Heading]} style={style}>
        {text}
      </Heading>
    );
  }
  return <Markdown text={text} className="max-w-[62ch] tabular-nums [overflow-wrap:anywhere]" style={style} />;
});

const Row = createComponentImplementation(RowApi, ({ props, buildChild }) => (
  <div className="flex flex-wrap gap-x-3 gap-y-2" style={placed(props)}>
    {childrenOf(props.children, buildChild)}
  </div>
));

const Column = createComponentImplementation(ColumnApi, ({ props, buildChild }) => (
  // A column that is empty for now (the evidence, the version field) takes no room, and no gap either.
  <div className="flex flex-col gap-2.5 empty:hidden" style={placed(props)}>
    {childrenOf(props.children, buildChild)}
  </div>
));

const CONTROL = 'h-[2.125rem] rounded-[7px] text-sm';

const Button = createComponentImplementation(ButtonApi, ({ props, buildChild }) => {
  const disabled = props.isValid === false;
  const label = props.child ? buildChild(props.child) : null;
  // The card's borderless buttons are its evidence links: they open a page elsewhere.
  if (props.variant === 'borderless') {
    return (
      <button
        type="button"
        onClick={props.action}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 self-start rounded-sm text-left underline underline-offset-[3px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        style={weighted(props.weight)}
      >
        {label}
        <ExternalLinkIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    );
  }
  return (
    <UiButton
      type="button"
      variant={props.variant === 'primary' ? 'default' : 'outline'}
      onClick={props.action}
      disabled={disabled}
      // The message of the failing check: why the button cannot be pressed now.
      title={disabled ? props.validationErrors?.[0] : undefined}
      className={cn(CONTROL, 'self-start px-3 disabled:text-faint', props.variant !== 'primary' && 'border-control')}
      style={weighted(props.weight)}
    >
      {label}
    </UiButton>
  );
});

const TextField = createComponentImplementation(TextFieldApi, ({ props }) => {
  const id = useId();
  const error = props.validationErrors?.[0];
  const label = props.label || undefined;
  const name = props.accessibility?.label;
  const field = {
    id,
    value: props.value || '',
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => props.setValue(event.target.value),
    // The label is shown inside the field until something is typed. A shorter name for it, if the
    // card gives one, is what a screen reader says.
    placeholder: label,
    'aria-label': typeof name === 'string' && name ? name : label,
    'aria-invalid': error ? true : undefined,
  };
  const long = props.variant === 'longText';
  return (
    // In a row a field takes the room it is given, up to a comfortable width for one line.
    <div className={cn('grid w-full gap-1.5', !long && 'max-w-88')} style={weighted(props.weight)}>
      {long ? (
        <Textarea {...field} className="min-h-[4.75rem] rounded-[7px] bg-background px-2.5 py-2 text-[0.9375rem] leading-snug md:text-[0.9375rem]" />
      ) : (
        <Input
          {...field}
          type={props.variant === 'number' ? 'number' : props.variant === 'obscured' ? 'password' : 'text'}
          className={cn(CONTROL, 'bg-background px-2.5 text-[0.9375rem] md:text-[0.9375rem]')}
        />
      )}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
});

// ---------------------------------------------------------------------------
// The incident catalog's own components
// ---------------------------------------------------------------------------

const Steps = createComponentImplementation(StepsApi, ({ props, buildChild }) => (
  // The one framed object on the card. It is a container for its steps' layout: a step sets
  // itself out by the room the card has, not by the width of the window.
  <ol className="@container rounded-[10px] border" style={weighted(props.weight)}>
    {childrenOf(props.children, buildChild)}
  </ol>
));

const STATE_IN_WORDS = { done: 'Done', current: 'In progress', failed: 'Stopped', pending: 'Not started' } as const;
const ROLE_DOT: Record<string, string> = {
  developer: 'bg-developer',
  'incident-manager': 'bg-incident-manager',
  'platform-engineer': 'bg-platform-engineer',
};

function StepMark({ state, closes, turn }: { state: keyof typeof STATE_IN_WORDS; closes?: boolean; turn?: boolean }) {
  const ring = 'col-start-1 grid size-[1.125rem] place-items-center rounded-full border-[1.5px]';
  if (state === 'current') return <span aria-hidden className="spinner col-start-1 size-[1.125rem]" />;
  if (state === 'done') {
    return (
      <span aria-hidden className={cn(ring, 'text-white', closes ? 'border-success bg-success' : 'border-foreground bg-foreground')}>
        <CheckIcon className="size-3" strokeWidth={3.5} />
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span aria-hidden className={cn(ring, 'border-foreground')}>
        <XIcon className="size-3" strokeWidth={3} />
      </span>
    );
  }
  return <span aria-hidden className={cn(ring, turn ? 'border-primary' : 'border-faint')} />;
}

// A step is one line when the card is wide: mark, name, owner, note, time. When it is narrow the
// owner and the note go under the name. The viewer's controls, when drawn, are under all of it.
const Step = createComponentImplementation(StepApi, ({ props, buildChild }) => {
  const { state, owner, note, time } = props;
  return (
    <li
      className={cn(
        'grid min-h-[2.875rem] grid-cols-[1.125rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-t px-3.5 py-2.5',
        'first:rounded-t-[9px] first:border-t-0 last:rounded-b-[9px]',
        '@[38rem]:grid-cols-[1.125rem_5.5rem_minmax(0,11.5rem)_minmax(0,1fr)_auto]',
        // The viewer's turn: the step takes a wash of their role's hue.
        props.turn && 'bg-primary/5',
      )}
      style={weighted(props.weight)}
    >
      <StepMark state={state} closes={props.closes} turn={props.turn} />
      <span className={cn('col-start-2 row-start-1', state === 'pending' ? 'text-muted-foreground' : 'font-medium')}>
        <span className="sr-only">{STATE_IN_WORDS[state]}: </span>
        {props.label}
      </span>
      {owner && (
        <span
          className={cn(
            'col-start-2 col-end-4 row-start-2 flex items-center gap-1.5 text-sm whitespace-nowrap @[38rem]:col-start-3 @[38rem]:row-start-1',
            props.you ? 'font-medium' : 'text-muted-foreground',
          )}
        >
          <i aria-hidden className={cn('size-2 shrink-0 rounded-full', ROLE_DOT[props.ownerRole ?? ''] ?? 'bg-faint')} />
          {owner}
          {props.you && ' (you)'}
        </span>
      )}
      {note && (
        <span className="col-start-2 col-end-4 row-start-3 flex items-center gap-1.5 text-sm text-muted-foreground @[38rem]:col-start-4 @[38rem]:col-end-5 @[38rem]:row-start-1">
          {props.busy && <i aria-hidden className="spinner size-3.5" />}
          {note}
        </span>
      )}
      {time && <time className="col-start-3 row-start-1 text-[0.8125rem] text-muted-foreground tabular-nums @[38rem]:col-start-5">{time}</time>}
      {props.open && props.child && (
        <div className="col-start-2 col-end-4 row-start-4 mt-2 pb-1 @[38rem]:col-end-6 @[38rem]:row-start-2">{buildChild(props.child)}</div>
      )}
    </li>
  );
});

const BADGE_TONE = {
  neutral: 'bg-muted text-foreground',
  red: 'bg-destructive-wash text-destructive',
  amber: 'bg-warning-wash text-warning',
  green: 'bg-success-wash text-success',
} as const;
// A status dot is brighter than the word beside it, so it reads from across a room.
const BADGE_DOT: Partial<Record<keyof typeof BADGE_TONE, string>> = { red: 'bg-destructive-bright', amber: 'bg-warning-bright' };

const Badge = createComponentImplementation(BadgeApi, ({ props }) => {
  if (!props.text) return null;
  const tone = props.tone ?? 'neutral';
  return (
    <span className={cn('inline-flex h-[1.625rem] items-center gap-1.5 rounded-md px-2 text-sm font-medium whitespace-nowrap', BADGE_TONE[tone])} style={weighted(props.weight)}>
      {props.icon === 'dot' && <i aria-hidden className={cn('size-2 rounded-full', BADGE_DOT[tone] ?? 'bg-current')} />}
      {props.icon === 'bars' && (
        <span aria-hidden className="flex h-3 items-end gap-0.5">
          <i className="h-[40%] w-[3px] rounded-[1px] bg-current" />
          <i className="h-[70%] w-[3px] rounded-[1px] bg-current" />
          <i className="h-full w-[3px] rounded-[1px] bg-current" />
        </span>
      )}
      {props.icon === 'check' && <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />}
      {props.text}
    </span>
  );
});

const Notice = createComponentImplementation(NoticeApi, ({ props }) => {
  // The viewer has one notice; the Notice beside the controls it is about draws it.
  if (!props.text || props.active !== props.slot) return null;
  return <Callout role="status" tone={props.tone} title={props.title} text={props.text} rule={props.rule || undefined} className="max-w-[34rem] self-start" />;
});

const ours = new Map([Text, Row, Column, Button, TextField].map((component) => [component.name, component]));

export const catalog = incidentCatalog<ReactComponentImplementation>(official, [
  ...[...official.components.values()].map((component) => ours.get(component.name) ?? component),
  Steps,
  Step,
  Badge,
  Notice,
]);
