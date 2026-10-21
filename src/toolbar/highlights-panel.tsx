import {
  BulletListIcon,
  CheckmarkIcon,
  EraserIcon,
  ExclamationmarkTriangleFillIcon,
  FilesIcon,
  XMarkIcon,
} from '@navikt/aksel-icons';
import {
  Badge,
  BodyShort,
  Button,
  Heading,
  HStack,
  InfoCard,
  Label,
  Loader,
  Popover,
  Tag,
  Tooltip,
  VStack,
} from '@navikt/ds-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { copyHighlight } from '@/files/pdf/highlights/copy-highlight';
import { useHighlightStore } from '@/files/pdf/highlights/highlight-store';
import { MARKER_COLOR } from '@/files/pdf/highlights/marker-style';
import type { StoredHighlight } from '@/files/pdf/highlights/types';
import { useHighlightDocuments, useHighlightStatus } from '@/files/pdf/highlights/use-highlight-documents';
import { HighlightText } from '@/toolbar/highlight-text';
import { useToolbarHeight } from '@/toolbar-height-context';

/** Space between the list and the bottom of the viewer. */
const BOTTOM_MARGIN = 16;
/** Used when the viewer's height is unknown. */
const DEFAULT_MAX_HEIGHT = 480;
/** How long the copy button shows that the text was copied. */
const COPIED_DURATION_MS = 2_000;
const SAVE_FAILED_SHORT = 'markeringene kunne ikke lagres';
const SAVE_FAILED_MESSAGE = 'Markeringene kunne ikke lagres. Endringene forsvinner når siden lastes på nytt.';
const LOADING_MESSAGE = 'Laster markeringer…';
const REJECTED_SHORT = 'endringene var for store til å lagres';
const REJECTED_MESSAGE = 'Endringene var for store til å lagres, og er angret. Prøv å markere mindre tekst om gangen.';

interface HighlightsPanelProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onNavigateToHighlight: (sectionIndex: number, highlightId: string) => void;
}

/** Toolbar button with a dropdown listing the marker highlights of all documents. */
export const HighlightsPanel = ({ scrollContainerRef, onNavigateToHighlight }: HighlightsPanelProps) => {
  const toolbarHeight = useToolbarHeight();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [maxHeight, setMaxHeight] = useState(DEFAULT_MAX_HEIGHT);
  const documents = useHighlightDocuments();
  const store = useHighlightStore();
  const status = useHighlightStatus();
  const { isLoading, hasUnsavedChanges, hasRejectedChanges } = status;
  const [isRetryingSaves, startRetryingSaves] = useTransition();
  const hasWarning = hasUnsavedChanges || hasRejectedChanges;
  const count = documents.reduce((sum, { highlights }) => sum + highlights.length, 0);
  const statusText = getStatusText(status);
  const label = `${open ? 'Skjul' : 'Vis'} markeringer (${count.toString(10)})${statusText === null ? '' : ` – ${statusText}`}`;
  const icon = hasWarning ? (
    <ExclamationmarkTriangleFillIcon aria-hidden />
  ) : isLoading ? (
    <Loader size="small" aria-hidden />
  ) : (
    <BulletListIcon aria-hidden />
  );

  const toggle = () => {
    const viewerHeight = scrollContainerRef.current?.clientHeight;

    if (viewerHeight !== undefined) {
      setMaxHeight(viewerHeight - toolbarHeight - BOTTOM_MARGIN);
    }

    setOpen((previous) => !previous);
  };

  const retryFailedSaves = () =>
    startRetryingSaves(async () => {
      await store.retryFailedSaves();

      // The retry button disappears with the warning, so keep focus near the list.
      if (!store.hasUnsavedChanges()) {
        anchor?.focus();
      }
    });

  // The clicked button disappears with the highlights, so keep focus near the list.
  const clearAndFocusAnchor = (clear: () => void) => {
    clear();
    anchor?.focus();
  };

  return (
    <>
      {/* Hidden rather than removed, so the button is not remounted and keeps focus. */}
      <Badge count={count} data-color="accent" aria-hidden className={count === 0 ? 'hidden' : undefined}>
        <Tooltip content={label} describesChild>
          <Button
            ref={setAnchor}
            size="xsmall"
            variant={open ? 'secondary' : 'tertiary'}
            data-color={hasWarning ? 'warning' : 'neutral'}
            onClick={toggle}
            icon={icon}
            aria-label="Markeringer"
            aria-expanded={open}
            aria-busy={isLoading}
          />
        </Tooltip>
      </Badge>

      <Popover open={open} onClose={() => setOpen(false)} anchorEl={anchor} placement="bottom-start" offset={0}>
        <Popover.Content className="w-80 overflow-y-auto whitespace-normal" style={{ maxHeight }}>
          <VStack gap="space-12">
            <HStack justify="space-between" align="center" gap="space-8" wrap={false}>
              <Heading size="xsmall" level="2">
                Markeringer
              </Heading>

              {documents.length === 0 ? null : (
                <Tooltip content="Fjern alle markeringer i alle dokumenter" describesChild>
                  <Button
                    size="xsmall"
                    variant="tertiary"
                    data-color="neutral"
                    icon={<EraserIcon aria-hidden />}
                    onClick={() => clearAndFocusAnchor(() => store.clear(store.getDocuments().map(({ key }) => key)))}
                  >
                    Fjern alle
                  </Button>
                </Tooltip>
              )}
            </HStack>

            {isLoading ? (
              <HStack gap="space-8" align="center" role="status">
                <Loader size="xsmall" aria-hidden />
                <BodyShort size="small">{LOADING_MESSAGE}</BodyShort>
              </HStack>
            ) : null}

            {hasUnsavedChanges ? (
              <RetryWarning message={SAVE_FAILED_MESSAGE} loading={isRetryingSaves} onRetry={retryFailedSaves} />
            ) : null}

            {hasRejectedChanges ? (
              <InfoCard data-color="warning" size="small" role="alert">
                <InfoCard.Message icon={<ExclamationmarkTriangleFillIcon aria-hidden />}>
                  <BodyShort size="small">{REJECTED_MESSAGE}</BodyShort>
                </InfoCard.Message>
              </InfoCard>
            ) : null}

            {documents.length === 0 ? (
              isLoading ? null : (
                <BodyShort size="small" textColor="subtle">
                  Ingen markeringer ennå. Slå på markeringspennen og marker tekst i et dokument.
                </BodyShort>
              )
            ) : (
              documents.map(({ sectionIndex, title, highlights, removeHighlight, clearHighlights }) => (
                <VStack as="section" key={sectionIndex} gap="space-4" aria-label={`Markeringer i ${title}`}>
                  <HStack justify="space-between" align="center" gap="space-8" wrap={false}>
                    <Label size="small" as="h3">
                      {title}
                    </Label>

                    <Tooltip content="Fjern alle markeringer i dokumentet" describesChild>
                      <Button
                        size="xsmall"
                        variant="tertiary"
                        data-color="neutral"
                        icon={<EraserIcon aria-hidden />}
                        aria-label={`Fjern alle markeringer i ${title}`}
                        onClick={() => clearAndFocusAnchor(clearHighlights)}
                      />
                    </Tooltip>
                  </HStack>

                  <VStack as="ul" gap="space-16" className="m-0 list-none p-0 pt-2">
                    {highlights.map((highlight) => (
                      <HighlightItem
                        key={highlight.id}
                        highlight={highlight}
                        onNavigate={() => onNavigateToHighlight(sectionIndex, highlight.id)}
                        onRemove={() => removeHighlight(highlight.id)}
                        fallbackFocusTarget={anchor}
                      />
                    ))}
                  </VStack>
                </VStack>
              ))
            )}
          </VStack>
        </Popover.Content>
      </Popover>
    </>
  );
};

const getStatusText = ({
  isLoading,
  hasUnsavedChanges,
  hasRejectedChanges,
}: ReturnType<typeof useHighlightStatus>): string | null => {
  if (hasUnsavedChanges) {
    return SAVE_FAILED_SHORT;
  }

  if (hasRejectedChanges) {
    return REJECTED_SHORT;
  }

  return isLoading ? LOADING_MESSAGE : null;
};

interface RetryWarningProps {
  message: string;
  onRetry: () => void;
  loading?: boolean;
}

const RetryWarning = ({ message, onRetry, loading }: RetryWarningProps) => (
  <InfoCard data-color="warning" size="small" role="alert">
    <InfoCard.Message icon={<ExclamationmarkTriangleFillIcon aria-hidden />}>
      <VStack gap="space-8" align="start">
        <BodyShort size="small">{message}</BodyShort>
        <Button size="xsmall" variant="secondary" loading={loading} onClick={onRetry}>
          Prøv igjen
        </Button>
      </VStack>
    </InfoCard.Message>
  </InfoCard>
);

interface HighlightItemProps {
  highlight: StoredHighlight;
  onNavigate: () => void;
  onRemove: () => void;
  /** Gets focus when the last highlight is removed. */
  fallbackFocusTarget: HTMLElement | null;
}

const HighlightItem = ({ highlight, onNavigate, onRemove, fallbackFocusTarget }: HighlightItemProps) => {
  const text = highlight.text.trim();
  const page = `Side ${(highlight.pageIndex + 1).toString(10)}`;
  const [copied, copy] = useCopyToClipboard();

  const handleRemove = (event: React.MouseEvent<HTMLButtonElement>) => {
    // The button disappears with the highlight, so keep focus in the list.
    const nextFocusTarget = getAdjacentRemoveButton(event.currentTarget) ?? fallbackFocusTarget;
    onRemove();
    nextFocusTarget?.focus();
  };

  return (
    <li
      className="border-ax-border-neutral-subtle bg-ax-bg-default relative flex rounded-md border border-l-4"
      style={{ borderLeftColor: MARKER_COLOR }}
    >
      {text.length === 0 ? null : (
        <ItemActionButton
          tooltip={copied ? 'Kopiert' : 'Kopier tekst'}
          label={`Kopier tekst på ${page.toLowerCase()}`}
          icon={copied ? <CheckmarkIcon aria-hidden /> : <FilesIcon aria-hidden />}
          onClick={() => copy(highlight)}
          className="hover:bg-ax-bg-neutral-moderate-hover hover:text-ax-text-neutral rounded-l-sm border-r"
        />
      )}

      <button
        type="button"
        onClick={onNavigate}
        className={`hover:bg-ax-bg-neutral-moderate-hover focus-visible:outline-ax-border-focus min-w-0 flex-1 cursor-pointer py-2 pr-2 pl-3 text-left focus-visible:outline-2 focus-visible:outline-offset-1 ${text.length === 0 ? 'rounded-l-sm' : ''}`}
      >
        <Tag data-color="neutral" variant="strong" size="xsmall" className="absolute top-0 right-2 -translate-y-1/2">
          {page}
        </Tag>
        <BodyShort as="span" size="small" className="line-clamp-3 wrap-break-word">
          <HighlightText highlight={highlight} />
        </BodyShort>
      </button>

      <ItemActionButton
        tooltip="Fjern markering"
        label={`Fjern markering på ${page.toLowerCase()}`}
        icon={<XMarkIcon aria-hidden />}
        onClick={handleRemove}
        className="hover:bg-ax-bg-danger-moderate-hover hover:text-ax-text-danger rounded-r-md border-l"
        data-klage-file-viewer-remove-highlight
      />
    </li>
  );
};

interface ItemActionButtonProps {
  tooltip: string;
  label: string;
  icon: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** Hover colours, divider side and corner rounding. */
  className: string;
  'data-klage-file-viewer-remove-highlight'?: boolean;
}

/** Full-height strip on the edge of a highlight item. */
const ItemActionButton = ({ tooltip, label, icon, onClick, className, ...rest }: ItemActionButtonProps) => (
  <Tooltip content={tooltip} placement="left" describesChild>
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`border-ax-border-neutral-subtle text-ax-text-neutral-subtle focus-visible:outline-ax-border-focus flex w-4 shrink-0 cursor-pointer items-center justify-center text-base focus-visible:outline-2 focus-visible:outline-offset-1 ${className}`}
      {...rest}
    >
      {icon}
    </button>
  </Tooltip>
);

/** Copies a highlight and reports `true` for a short while afterwards. */
const useCopyToClipboard = (): [boolean, (highlight: StoredHighlight) => void] => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearCopiedTimeout(timeoutRef), []);

  const copy = (highlight: StoredHighlight) => {
    copyHighlight(highlight).then(
      () => {
        clearCopiedTimeout(timeoutRef);
        setCopied(true);
        timeoutRef.current = setTimeout(() => setCopied(false), COPIED_DURATION_MS);
      },
      () => undefined,
    );
  };

  return [copied, copy];
};

const clearCopiedTimeout = (timeoutRef: React.RefObject<ReturnType<typeof setTimeout> | null>) => {
  if (timeoutRef.current !== null) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
};

const getAdjacentRemoveButton = (button: HTMLElement): HTMLElement | null => {
  const item = button.closest('li');
  const sibling = item?.nextElementSibling ?? item?.previousElementSibling ?? null;

  return sibling?.querySelector<HTMLElement>('[data-klage-file-viewer-remove-highlight]') ?? null;
};
