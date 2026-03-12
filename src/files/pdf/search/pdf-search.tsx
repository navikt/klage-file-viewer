import { ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon, XMarkIcon } from '@navikt/aksel-icons';
import { BodyShort, Button, HStack, Tooltip } from '@navikt/ds-react';
import {
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { SearchableDocument } from '@/files/pdf/search/search';
import { computeHighlights } from '@/files/pdf/search/search';
import type { PageHighlights, SearchMatch } from '@/files/pdf/search/types';
import { CaseSensitiveIcon } from '@/lib/case-sensitive-icon';
import { isMetaKey, Keys, MOD_KEY_TEXT } from '@/lib/keys';

type PdfSearchProps = {
  isSearchOpen: boolean;
  setIsSearchOpen: Dispatch<SetStateAction<boolean>>;
  documents: SearchableDocument[];
  onHighlightsChange: (highlights: PageHighlights[]) => void;
  currentMatchIndex: number;
  onCurrentMatchIndexChange: (index: number) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
};

export const PdfSearch = ({
  isSearchOpen,
  setIsSearchOpen,
  documents,
  onHighlightsChange,
  currentMatchIndex,
  onCurrentMatchIndexChange,
  searchInputRef,
  scrollContainerRef,
}: PdfSearchProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const searchVersionRef = useRef(0);

  // Clear highlights when component unmounts (search is closed)
  useEffect(() => {
    return () => {
      onHighlightsChange([]);
      onCurrentMatchIndexChange(0);
    };
  }, [onHighlightsChange, onCurrentMatchIndexChange]);

  const goToNextMatch = useCallback(() => {
    if (matches.length === 0) {
      return;
    }
    const nextIndex = (currentMatchIndex + 1) % matches.length;
    onCurrentMatchIndexChange(nextIndex);
  }, [currentMatchIndex, matches.length, onCurrentMatchIndexChange]);

  const goToPreviousMatch = useCallback(() => {
    if (matches.length === 0) {
      return;
    }
    const prevIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
    onCurrentMatchIndexChange(prevIndex);
  }, [currentMatchIndex, matches.length, onCurrentMatchIndexChange]);

  const handleSearchChange = useCallback(
    async (value: string) => {
      setSearchQuery(value);
      searchVersionRef.current += 1;
      const version = searchVersionRef.current;

      if (value.length === 0) {
        onHighlightsChange([]);
        setMatches([]);
        onCurrentMatchIndexChange(0);
        return;
      }

      const { highlights, matches } = await computeHighlights(value, documents, caseSensitive);

      // Discard stale results
      if (version !== searchVersionRef.current) {
        return;
      }

      onHighlightsChange(highlights);
      setMatches(matches);

      if (matches.length !== 0) {
        onCurrentMatchIndexChange(0);
      }
    },
    [documents, onHighlightsChange, onCurrentMatchIndexChange, caseSensitive],
  );

  // Recalculate highlights when documents change (scale/rotation changed)
  useEffect(() => {
    if (searchQuery.length === 0) {
      return;
    }

    searchVersionRef.current += 1;
    const version = searchVersionRef.current;

    const runSearch = async () => {
      const { highlights, matches } = await computeHighlights(searchQuery, documents, caseSensitive);

      if (version !== searchVersionRef.current) {
        return;
      }

      onHighlightsChange(highlights);
      setMatches(matches);
    };

    void runSearch();
  }, [documents, searchQuery, onHighlightsChange, caseSensitive]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    onHighlightsChange([]);
    setMatches([]);
    onCurrentMatchIndexChange(0);
  }, [onHighlightsChange, onCurrentMatchIndexChange]);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    clearSearch();
    scrollContainerRef.current?.focus();
  }, [setIsSearchOpen, clearSearch, scrollContainerRef]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === Keys.Escape) {
        event.preventDefault();
        closeSearch();
        return;
      }

      if (event.key === Keys.Enter) {
        event.preventDefault();
        if (event.shiftKey) {
          goToPreviousMatch();
        } else {
          goToNextMatch();
        }
        return;
      }

      if (isMetaKey(event) && event.key === Keys.G) {
        event.preventDefault();
        if (event.shiftKey) {
          goToPreviousMatch();
        } else {
          goToNextMatch();
        }
      }
    },
    [closeSearch, goToNextMatch, goToPreviousMatch],
  );

  return (
    <HStack gap="space-4" align="center" wrap={false} onKeyDown={handleKeyDown}>
      <Tooltip content="Søk i PDF" keys={[MOD_KEY_TEXT, 'F']} placement="top" describesChild>
        <Button
          type="button"
          size="xsmall"
          variant={isSearchOpen ? 'primary' : 'tertiary'}
          data-color={isSearchOpen ? 'accent' : 'neutral'}
          icon={<MagnifyingGlassIcon aria-hidden />}
          onClick={() => (isSearchOpen ? closeSearch() : setIsSearchOpen(true))}
        />
      </Tooltip>
      {isSearchOpen ? (
        <PdfSearchUI
          searchQuery={searchQuery}
          closeSearch={closeSearch}
          currentMatchIndex={currentMatchIndex}
          goToNextMatch={goToNextMatch}
          goToPreviousMatch={goToPreviousMatch}
          handleClear={clearSearch}
          handleSearchChange={handleSearchChange}
          matches={matches}
          searchInputRef={searchInputRef}
          caseSensitive={caseSensitive}
          setCaseSensitive={setCaseSensitive}
        />
      ) : null}
    </HStack>
  );
};

interface PdfSearchUIProps {
  searchQuery: string;
  matches: SearchMatch[];
  currentMatchIndex: number;
  goToNextMatch: () => void;
  goToPreviousMatch: () => void;
  handleSearchChange: (value: string) => Promise<void>;
  closeSearch: () => void;
  handleClear: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  caseSensitive: boolean;
  setCaseSensitive: React.Dispatch<React.SetStateAction<boolean>>;
}

const PdfSearchUI = ({
  searchQuery,
  matches,
  currentMatchIndex,
  goToNextMatch,
  goToPreviousMatch,
  closeSearch,
  handleClear,
  handleSearchChange,
  searchInputRef,
  caseSensitive,
  setCaseSensitive,
}: PdfSearchUIProps) => {
  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === Keys.Escape) {
        event.preventDefault();
        event.stopPropagation();
        handleClear();
        closeSearch();
      }
    },
    [handleClear, closeSearch],
  );

  useEffect(() => searchInputRef.current?.focus(), [searchInputRef]);

  return (
    <HStack gap="space-0" align="center" wrap={false}>
      <HStack
        align="center"
        wrap={false}
        className="h-full rounded border border-ax-border-neutral bg-ax-bg-input outline-ax-border-focus focus-within:outline-2"
      >
        <input
          type="search"
          ref={searchInputRef}
          value={searchQuery}
          onChange={({ target }) => void handleSearchChange(target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={`Søk (${MOD_KEY_TEXT}+F)`}
          className="h-full w-40 px-2 focus:outline-none"
        />

        <Button
          variant="tertiary"
          data-color="neutral"
          size="xsmall"
          onClick={() => void handleSearchChange('')}
          icon={<XMarkIcon aria-hidden />}
          aria-label="Tøm søk"
        />
      </HStack>

      <Tooltip content="Krev nøyaktig samsvar med store og små bokstaver">
        <Button
          icon={<CaseSensitiveIcon aria-hidden width={20} />}
          size="xsmall"
          role="switch"
          aria-checked={caseSensitive}
          onClick={() => setCaseSensitive((s) => !s)}
          variant={caseSensitive ? 'primary' : 'tertiary'}
          data-color={caseSensitive ? 'accent' : 'neutral'}
        />
      </Tooltip>

      <Tooltip content="Forrige treff" keys={[Keys.Shift, Keys.Enter]} placement="top" describesChild>
        <Button
          type="button"
          size="xsmall"
          variant="tertiary-neutral"
          icon={<ChevronLeftIcon aria-hidden />}
          onClick={goToPreviousMatch}
        />
      </Tooltip>

      <Tooltip content="Neste treff" keys={[Keys.Enter]} placement="top" describesChild>
        <Button
          type="button"
          size="xsmall"
          variant="tertiary-neutral"
          icon={<ChevronRightIcon aria-hidden />}
          onClick={goToNextMatch}
        />
      </Tooltip>

      {matches.length > 0 ? (
        <BodyShort size="small" className="whitespace-nowrap">
          {currentMatchIndex + 1} / {matches.length}
        </BodyShort>
      ) : searchQuery.length > 0 ? (
        <BodyShort size="small" textColor="subtle" className="whitespace-nowrap">
          Ingen treff
        </BodyShort>
      ) : null}
    </HStack>
  );
};
