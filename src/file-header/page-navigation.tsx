import { ChevronDownIcon, ChevronUpIcon } from '@navikt/aksel-icons';
import { Button, Tooltip } from '@navikt/ds-react';
import { MOD_KEY_TEXT } from '@/lib/keys';

export interface DocumentNavigation {
  goToPreviousDocument?: () => void;
  goToNextDocument?: () => void;
}

interface PageNavigationProps {
  currentPage: number | null;
  numPages: number | null;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  previousPageDisabled?: boolean;
  nextPageDisabled?: boolean;
  documentNavigation?: DocumentNavigation;
}

export const PageNavigation = ({
  currentPage,
  numPages,
  onPreviousPage,
  onNextPage,
  previousPageDisabled,
  nextPageDisabled,
  documentNavigation,
}: PageNavigationProps) => (
  <>
    <PreviousPageButton
      currentPage={currentPage}
      onPreviousPage={onPreviousPage}
      previousPageDisabled={previousPageDisabled}
      goToPreviousDocument={documentNavigation?.goToPreviousDocument}
    />

    <NextPageButton
      currentPage={currentPage}
      numPages={numPages}
      onNextPage={onNextPage}
      nextPageDisabled={nextPageDisabled}
      goToNextDocument={documentNavigation?.goToNextDocument}
    />
  </>
);

interface PreviousPageButtonProps {
  currentPage: number | null;
  onPreviousPage?: () => void;
  previousPageDisabled?: boolean;
  goToPreviousDocument?: () => void;
}

const PreviousPageButton = ({
  currentPage,
  onPreviousPage,
  previousPageDisabled,
  goToPreviousDocument,
}: PreviousPageButtonProps) => {
  if (onPreviousPage === undefined && goToPreviousDocument === undefined) {
    return null;
  }

  const isPageDisabled =
    onPreviousPage === undefined || (previousPageDisabled ?? (currentPage === null || currentPage <= 1));
  const fallsBackToDocument = isPageDisabled && goToPreviousDocument !== undefined;

  return (
    <Tooltip content="Forrige side" keys={[MOD_KEY_TEXT, '↑']} describesChild>
      <Button
        size="xsmall"
        variant="tertiary"
        data-color="neutral"
        icon={<ChevronUpIcon aria-hidden />}
        onClick={fallsBackToDocument ? goToPreviousDocument : onPreviousPage}
        disabled={isPageDisabled && !fallsBackToDocument}
      />
    </Tooltip>
  );
};

interface NextPageButtonProps {
  currentPage: number | null;
  numPages: number | null;
  onNextPage?: () => void;
  nextPageDisabled?: boolean;
  goToNextDocument?: () => void;
}

const NextPageButton = ({
  currentPage,
  numPages,
  onNextPage,
  nextPageDisabled,
  goToNextDocument,
}: NextPageButtonProps) => {
  if (onNextPage === undefined && goToNextDocument === undefined) {
    return null;
  }

  const isPageDisabled =
    onNextPage === undefined ||
    (nextPageDisabled ?? (currentPage === null || numPages === null || currentPage >= numPages));
  const fallsBackToDocument = isPageDisabled && goToNextDocument !== undefined;

  return (
    <Tooltip content="Neste side" keys={[MOD_KEY_TEXT, '↓']} describesChild>
      <Button
        size="xsmall"
        variant="tertiary"
        data-color="neutral"
        icon={<ChevronDownIcon aria-hidden />}
        onClick={fallsBackToDocument ? goToNextDocument : onNextPage}
        disabled={isPageDisabled && !fallsBackToDocument}
      />
    </Tooltip>
  );
};
