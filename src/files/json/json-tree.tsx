import { ChevronDownIcon, ChevronRightIcon } from '@navikt/aksel-icons';
import { useCallback, useState } from 'react';
import type { JsonArray, JsonData, JsonObject } from '@/files/json/use-json-data';

interface JsonTreeProps {
  value: JsonData;
  initialExpanded?: boolean;
}

export const JsonTree = ({ value, initialExpanded = true }: JsonTreeProps) => (
  <pre className="wrap-break-word m-0 whitespace-pre-wrap leading-relaxed">
    <JsonValue value={value} depth={0} initialExpanded={initialExpanded} />
  </pre>
);

interface JsonValueProps {
  value: JsonData;
  depth: number;
  initialExpanded: boolean;
}

const JsonValue = ({ value, depth, initialExpanded }: JsonValueProps) => {
  if (value === null) {
    return <span className="text-ax-text-danger">null</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="text-ax-text-danger">{value ? 'true' : 'false'}</span>;
  }

  if (typeof value === 'number') {
    return <span className="text-ax-text-info">{value.toString(10)}</span>;
  }

  if (typeof value === 'string') {
    return <span className="text-ax-text-success">{`"${escapeJsonString(value)}"`}</span>;
  }

  if (Array.isArray(value)) {
    return <JsonArrayComponent items={value} depth={depth} initialExpanded={initialExpanded} />;
  }

  if (typeof value === 'object') {
    return <JsonObjectComponent object={value} depth={depth} initialExpanded={initialExpanded} />;
  }

  return <span>{String(value)}</span>;
};

interface JsonArrayProps {
  items: JsonArray;
  depth: number;
  initialExpanded: boolean;
}

const JsonArrayComponent = ({ items, depth, initialExpanded }: JsonArrayProps) => {
  const [expanded, setExpanded] = useState(initialExpanded && depth < 3);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  if (items.length === 0) {
    return <span>{'[]'}</span>;
  }

  if (!expanded) {
    return (
      <span>
        <ToggleButton onClick={toggle} expanded={false} openBracket="[" />
        <span className="text-ax-text-subtle">{` Array(${items.length.toString(10)}) `}</span>
        {']'}
      </span>
    );
  }

  const indent = getIndent(depth + 1);
  const closingIndent = getIndent(depth);

  return (
    <span>
      <ToggleButton onClick={toggle} expanded openBracket="[" />
      {'\n'}
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: JSON array items have no stable unique identifier
        <span key={index}>
          {indent}
          <JsonValue value={item} depth={depth + 1} initialExpanded={initialExpanded} />
          {index < items.length - 1 ? ',' : ''}
          {'\n'}
        </span>
      ))}
      {closingIndent}
      {']'}
    </span>
  );
};

interface JsonObjectProps {
  object: JsonObject;
  depth: number;
  initialExpanded: boolean;
}

const JsonObjectComponent = ({ object, depth, initialExpanded }: JsonObjectProps) => {
  const entries = Object.entries(object);
  const [expanded, setExpanded] = useState(initialExpanded && depth < 3);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  if (entries.length === 0) {
    return <span>{'{}'}</span>;
  }

  if (!expanded) {
    return (
      <span>
        <ToggleButton onClick={toggle} expanded={false} openBracket="{" />
        <span className="text-ax-text-subtle">
          {` ${entries.length.toString(10)} ${entries.length === 1 ? 'nøkkel' : 'nøkler'} `}
        </span>
        {'}'}
      </span>
    );
  }

  const indent = getIndent(depth + 1);
  const closingIndent = getIndent(depth);

  return (
    <span>
      <ToggleButton onClick={toggle} expanded openBracket="{" />
      {'\n'}
      {entries.map(([key, val], index) => (
        <span key={key}>
          {indent}
          <span className="text-ax-text-accent">{`"${escapeJsonString(key)}"`}</span>
          {': '}
          <JsonValue value={val} depth={depth + 1} initialExpanded={initialExpanded} />
          {index < entries.length - 1 ? ',' : ''}
          {'\n'}
        </span>
      ))}
      {closingIndent}
      {'}'}
    </span>
  );
};

interface ToggleButtonProps {
  onClick: () => void;
  expanded: boolean;
  openBracket: '[' | '{';
}

const ToggleButton = ({ onClick, expanded, openBracket }: ToggleButtonProps) => {
  const Icon = expanded ? ChevronDownIcon : ChevronRightIcon;
  const label = expanded ? 'Skjul' : 'Utvid';

  return (
    <button
      type="button"
      onClick={onClick}
      className="mr-1 inline-flex cursor-pointer items-center border-none bg-transparent p-0 align-middle text-ax-icon-neutral hover:text-ax-icon-action"
      aria-label={label}
      aria-expanded={expanded}
    >
      <Icon aria-hidden fontSize="1rem" />
      {openBracket}
    </button>
  );
};

const INDENT = '  ';

const getIndent = (depth: number): string => INDENT.repeat(depth);

const escapeJsonString = (str: string): string =>
  str
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t');
