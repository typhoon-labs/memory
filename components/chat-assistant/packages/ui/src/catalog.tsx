/**
 * The catalog the card is rendered with: A2UI's basic catalog and its official
 * React components, with one substitution.
 *
 * The Button of @a2ui/react 0.12.0 is published without its CSS-module class
 * names, so `primary` and `borderless` buttons cannot be told apart or styled.
 * This Button uses the same schema (`ButtonApi`) and the same behaviour, adds
 * class names, and shows the message of a failing check as the reason a button
 * is disabled. Custom implementations of catalog components are the
 * renderer's documented extension point.
 */
import { basicCatalog as official, createComponentImplementation, type ReactComponentImplementation } from '@a2ui/react/v0_9';
import { Catalog } from '@a2ui/web_core/v0_9';
import { ButtonApi } from '@a2ui/web_core/v0_9/basic_catalog';

const Button = createComponentImplementation(ButtonApi, ({ props, buildChild }) => {
  const disabled = props.isValid === false;
  const why = disabled ? props.validationErrors?.[0] : undefined;
  return (
    <button
      type="button"
      className={`a2ui-button ${props.variant ?? 'default'}`}
      onClick={props.action}
      disabled={disabled}
      title={why}
    >
      {props.child ? buildChild(props.child) : null}
    </button>
  );
});

export const catalog = new Catalog<ReactComponentImplementation>(
  official.id,
  official.protocolVersion,
  [...official.components.values()].map((component) => (component.name === 'Button' ? Button : component)),
  [...official.functions.values()],
  official.themeSchema,
);
