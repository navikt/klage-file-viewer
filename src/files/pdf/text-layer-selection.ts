import { useCallback, useEffect, useRef } from 'react';

/**
 * Global registry of text layer divs to their endOfContent divs.
 * Mirrors the static `#textLayers` map in PDF.js `TextLayerBuilder`.
 */
const textLayers = new Map<HTMLDivElement, HTMLDivElement>();

let globalAbortController: AbortController | null = null;

const reset = (endDiv: HTMLDivElement, textLayerDiv: HTMLDivElement): void => {
  textLayerDiv.append(endDiv);
  endDiv.style.width = '';
  endDiv.style.height = '';
  endDiv.style.userSelect = '';
  textLayerDiv.classList.remove('selecting');
};

/**
 * Return the set of registered text layer divs that intersect the current selection.
 */
const findActiveTextLayers = (selection: Selection): Set<HTMLDivElement> => {
  const active = new Set<HTMLDivElement>();

  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);

    for (const textLayerDiv of textLayers.keys()) {
      if (!active.has(textLayerDiv) && range.intersectsNode(textLayerDiv)) {
        active.add(textLayerDiv);
      }
    }
  }

  return active;
};

/**
 * When the end offset is 0 the browser has placed the boundary just
 * *before* the next element, so walk backwards to the actual content node.
 * This matches the upstream PDF.js traversal logic.
 */
const walkBackToContent = (start: Node): Node => {
  let node = start;

  while (true) {
    while (node.previousSibling === null) {
      node = node.parentNode as Node;
    }

    node = node.previousSibling;

    if (node.childNodes.length > 0) {
      return node;
    }
  }
};

/**
 * Reposition the `.endOfContent` div inline next to the selection anchor so
 * the browser sees a continuous selectable surface during drag.
 *
 * This is a faithful port of the repositioning logic from PDF.js
 * `TextLayerBuilder.#enableGlobalSelectionListener`.
 */
const repositionEndOfContent = (selection: Selection, prevRange: Range | null): Range => {
  const range = selection.getRangeAt(0);

  const modifyStart =
    prevRange !== null &&
    (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
      range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);

  let anchor: Node = modifyStart ? range.startContainer : range.endContainer;

  if (anchor.nodeType === Node.TEXT_NODE) {
    anchor = anchor.parentNode as Node;
  }

  if (!modifyStart && range.endOffset === 0) {
    anchor = walkBackToContent(anchor);
  }

  const parentTextLayer = (anchor as HTMLElement).parentElement?.closest('.textLayer') as HTMLDivElement | null;
  const endDiv = parentTextLayer === null ? undefined : textLayers.get(parentTextLayer);

  if (endDiv !== undefined && parentTextLayer !== null) {
    endDiv.style.width = parentTextLayer.style.width;
    endDiv.style.height = parentTextLayer.style.height;
    endDiv.style.userSelect = 'text';
    (anchor as HTMLElement).parentElement?.insertBefore(endDiv, modifyStart ? anchor : anchor.nextSibling);
  }

  return range.cloneRange();
};

/**
 * Enables a single global `selectionchange` listener (and related pointer/keyboard
 * listeners) shared by all text layer instances. This is a faithful port of
 * `TextLayerBuilder.#enableGlobalSelectionListener` from PDF.js.
 *
 * The listener repositions the `.endOfContent` div inline next to the selection
 * anchor during a drag, which gives the browser a continuous selectable surface
 * and prevents the selection from "jumping" when the cursor is between spans.
 */
const enableGlobalSelectionListener = (): void => {
  if (globalAbortController !== null) {
    return;
  }

  globalAbortController = new AbortController();
  const { signal } = globalAbortController;

  let isPointerDown = false;

  document.addEventListener(
    'pointerdown',
    () => {
      isPointerDown = true;
    },
    { signal },
  );

  document.addEventListener(
    'pointerup',
    () => {
      isPointerDown = false;
      textLayers.forEach(reset);
    },
    { signal },
  );

  window.addEventListener(
    'blur',
    () => {
      isPointerDown = false;
      textLayers.forEach(reset);
    },
    { signal },
  );

  document.addEventListener(
    'keyup',
    () => {
      if (!isPointerDown) {
        textLayers.forEach(reset);
      }
    },
    { signal },
  );

  let isFirefox: boolean | undefined;
  let prevRange: Range | null = null;

  document.addEventListener(
    'selectionchange',
    () => {
      const selection = document.getSelection();

      if (selection === null || selection.rangeCount === 0) {
        textLayers.forEach(reset);
        return;
      }

      const activeTextLayers = findActiveTextLayers(selection);

      for (const [textLayerDiv, endDiv] of textLayers) {
        if (activeTextLayers.has(textLayerDiv)) {
          textLayerDiv.classList.add('selecting');
        } else {
          reset(endDiv, textLayerDiv);
        }
      }

      // Firefox handles selection across absolutely-positioned elements
      // natively, so the endOfContent repositioning trick is not needed.
      if (isFirefox === undefined) {
        const firstEnd = textLayers.values().next();

        if (!firstEnd.done) {
          isFirefox = getComputedStyle(firstEnd.value).getPropertyValue('-moz-user-select') === 'none';
        }
      }

      if (isFirefox === true) {
        return;
      }

      prevRange = repositionEndOfContent(selection, prevRange);
    },
    { signal },
  );
};

const removeGlobalSelectionListener = (textLayerDiv: HTMLDivElement): void => {
  textLayers.delete(textLayerDiv);

  if (textLayers.size === 0) {
    globalAbortController?.abort();
    globalAbortController = null;
  }
};

/**
 * React hook that replicates the selection management from PDF.js `TextLayerBuilder`.
 *
 * After `TextLayer.render()` completes, call this hook's returned `initSelection`
 * function with the text layer div. It will:
 *
 * 1. Create and append a `.endOfContent` div.
 * 2. Add a `mousedown` listener that toggles the `.selecting` class.
 * 3. Register the text layer in a global registry that powers a shared
 *    `selectionchange` listener, which repositions the `.endOfContent` div
 *    next to the selection anchor during drag to prevent selection jumps.
 *
 * The hook automatically cleans up when the component unmounts.
 */
export const useTextLayerSelection = (): {
  initSelection: (textLayerElement: HTMLDivElement) => void;
} => {
  const registeredRef = useRef<HTMLDivElement | null>(null);
  const mouseDownControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (registeredRef.current !== null) {
        removeGlobalSelectionListener(registeredRef.current);
        registeredRef.current = null;
      }

      mouseDownControllerRef.current?.abort();
      mouseDownControllerRef.current = null;
    };
  }, []);

  const initSelection = useCallback((textLayerElement: HTMLDivElement): void => {
    // Clean up previous registration if re-initialised (e.g. after a re-render).
    if (registeredRef.current !== null) {
      removeGlobalSelectionListener(registeredRef.current);
      registeredRef.current = null;
    }

    mouseDownControllerRef.current?.abort();

    // Create .endOfContent div
    const endOfContent = document.createElement('div');
    endOfContent.className = 'endOfContent';
    textLayerElement.append(endOfContent);

    // Add mousedown listener on the text layer to toggle the selecting class.
    const mouseDownController = new AbortController();
    mouseDownControllerRef.current = mouseDownController;

    textLayerElement.addEventListener(
      'mousedown',
      () => {
        textLayerElement.classList.add('selecting');
      },
      { signal: mouseDownController.signal },
    );

    // Register in global map and enable the shared selection listener.
    textLayers.set(textLayerElement, endOfContent);
    registeredRef.current = textLayerElement;
    enableGlobalSelectionListener();
  }, []);

  return { initSelection };
};
