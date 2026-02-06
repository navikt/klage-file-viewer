import { Box, HStack } from '@navikt/ds-react';
import { type JSX, useCallback, useMemo } from 'react';
import { KlageFileViewerFitMode } from '@/hooks/use-initial-scale';
import {
  LINE_FONT_SIZE,
  LOGO_CIRCLE_RADIUS,
  MIN_SCALE,
  PDF_MARGIN,
  PDF_PADDING_X,
  PDF_PADDING_Y,
  PDF_PAGE_HEIGHT,
  PDF_PAGE_WIDTH,
  TITLE_FONT_SIZE,
} from '@/scale/constants';
import { useScreenSize } from '@/scale/screen-size-hook';

interface Props {
  title: string;
  customScale?: number;
  scaleMode: KlageFileViewerFitMode;
}

export const ScalePreviewSvg = ({ title, customScale, scaleMode }: Props) => {
  const screen = useScreenSize();
  const aspectRatio = `${screen.width / screen.height}`;

  return (
    <Box padding="space-4" background="neutral-soft" overflow="hidden" width="100%" shadow="dialog">
      <HStack align="center" justify="center" position="relative" style={{ aspectRatio }}>
        <PdfContent title={title} customScale={customScale} scaleMode={scaleMode} />
      </HStack>
    </Box>
  );
};

interface Line {
  key: string;
  height: number;
  width: number;
}

const LINES: Line[] = [
  { key: '0', height: TITLE_FONT_SIZE, width: 0.9 },
  { key: '1', height: LINE_FONT_SIZE, width: 0.6 },
  { key: '2', height: LINE_FONT_SIZE, width: 0.8 },
  { key: '3', height: LINE_FONT_SIZE, width: 0.7 },
  { key: '4', height: LINE_FONT_SIZE, width: 0.5 },
  { key: '5', height: LINE_FONT_SIZE, width: 0.8 },
  { key: '6', height: LINE_FONT_SIZE, width: 0.4 },
  { key: '7', height: LINE_FONT_SIZE, width: 0.7 },
  { key: '8', height: LINE_FONT_SIZE, width: 0.6 },
  { key: '9', height: LINE_FONT_SIZE, width: 0.9 },
  { key: '10', height: LINE_FONT_SIZE, width: 0.4 },
  { key: '11', height: LINE_FONT_SIZE, width: 0 },
  { key: '12', height: TITLE_FONT_SIZE, width: 0.5 },
  { key: '13', height: LINE_FONT_SIZE, width: 0.8 },
  { key: '14', height: LINE_FONT_SIZE, width: 0.6 },
  { key: '15', height: LINE_FONT_SIZE, width: 1 },
  { key: '16', height: LINE_FONT_SIZE, width: 0.3 },
  { key: '17', height: LINE_FONT_SIZE, width: 0.5 },
  { key: '18', height: LINE_FONT_SIZE, width: 0.8 },
  { key: '19', height: LINE_FONT_SIZE, width: 0.4 },
  { key: '20', height: LINE_FONT_SIZE, width: 0.6 },
  { key: '21', height: LINE_FONT_SIZE, width: 0.7 },
  { key: '22', height: LINE_FONT_SIZE, width: 0.8 },
  { key: '23', height: LINE_FONT_SIZE, width: 0.7 },
  { key: '24', height: LINE_FONT_SIZE, width: 0 },
  { key: '25', height: LINE_FONT_SIZE, width: 0.9 },
  { key: '26', height: LINE_FONT_SIZE, width: 0.4 },
  { key: '27', height: LINE_FONT_SIZE, width: 0.2 },
  { key: '28', height: LINE_FONT_SIZE, width: 0.8 },
  { key: '29', height: LINE_FONT_SIZE, width: 0.6 },
  { key: '30', height: LINE_FONT_SIZE, width: 0 },
  { key: '31', height: LINE_FONT_SIZE, width: 0.2 },
  { key: '32', height: LINE_FONT_SIZE, width: 0.3 },
  { key: '33', height: LINE_FONT_SIZE, width: 0.7 },
  { key: '34', height: LINE_FONT_SIZE, width: 0.5 },
  { key: '35', height: LINE_FONT_SIZE, width: 1 },
  { key: '36', height: LINE_FONT_SIZE, width: 0.8 },
];

const MAX_CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_PADDING_X * 2;
const PAGE_GAP = PDF_MARGIN * 3;

const getLines = (initialOffset: number) => {
  const lines: JSX.Element[] = [];

  let lineOffset = initialOffset + PDF_PADDING_Y;

  for (const { key, width, height } of LINES) {
    lines.push(
      <LineRect key={key} x={PDF_PADDING_X} y={lineOffset} width={MAX_CONTENT_WIDTH * width} height={height} />,
    );

    lineOffset += height * 1.5; // Height + 50% margin
  }

  return lines;
};

interface PdfContentProps {
  title: string;
  customScale?: number;
  scaleMode: KlageFileViewerFitMode;
}

const PdfContent = ({ title, customScale = 100, scaleMode }: PdfContentProps) => {
  const screen = useScreenSize();

  const pageCount = Math.ceil(screen.height / (PDF_PAGE_HEIGHT / (100 / MIN_SCALE)));
  const totalPageGap = (pageCount - 1) * PAGE_GAP;
  const totalPdfHeight = PDF_PAGE_HEIGHT * pageCount + totalPageGap;

  const scaledWidth = (customScale / 100) * PDF_PAGE_WIDTH;

  const getLeft = useCallback(
    (width: number) => (width >= screen.width ? 0 : `${(100 - (width / screen.width) * 100) / 2}%`),
    [screen.width],
  );

  const css = useMemo<React.CSSProperties>(() => {
    switch (scaleMode) {
      case KlageFileViewerFitMode.PAGE_FIT:
        return { height: `${(totalPdfHeight / PDF_PAGE_HEIGHT) * 100}%`, left: getLeft(PDF_PAGE_WIDTH) };
      case KlageFileViewerFitMode.PAGE_HEIGHT:
        return { height: `${(totalPdfHeight / PDF_PAGE_HEIGHT) * 100}%`, left: getLeft(PDF_PAGE_WIDTH) };
      case KlageFileViewerFitMode.PAGE_WIDTH:
        return { width: '100%', left: 0 };
      case KlageFileViewerFitMode.CUSTOM:
        return { width: `${(scaledWidth / screen.width) * 100}%`, left: getLeft(scaledWidth) };
      case KlageFileViewerFitMode.NONE:
        return { height: `${(totalPdfHeight / screen.height) * 100}%`, left: getLeft(PDF_PAGE_WIDTH) };
    }
  }, [scaleMode, scaledWidth, screen.width, screen.height, getLeft, totalPdfHeight]);

  return (
    <svg
      viewBox={`0 0 ${PDF_PAGE_WIDTH} ${totalPdfHeight}`}
      style={{ top: 0, ...css }}
      className="absolute drop-shadow-lg"
    >
      <title>{title}</title>
      {/* Page background */}
      <rect x={0} y={0} width="100%" height={PDF_PAGE_HEIGHT} fill="white" strokeWidth="0" />
      {/* Address */}
      <LineRect x={PDF_PADDING_X} y={PDF_PADDING_Y} width={MAX_CONTENT_WIDTH * 0.1} height={LINE_FONT_SIZE} />
      <LineRect
        x={PDF_PADDING_X}
        y={PDF_PADDING_Y + LINE_FONT_SIZE * 1.5}
        width={MAX_CONTENT_WIDTH * 0.4}
        height={LINE_FONT_SIZE}
      />
      <LineRect
        x={PDF_PADDING_X}
        y={PDF_PADDING_Y + LINE_FONT_SIZE * 3}
        width={MAX_CONTENT_WIDTH * 0.2}
        height={LINE_FONT_SIZE}
      />
      {/* Nav logo circle */}
      <circle
        cx={PDF_PADDING_X + MAX_CONTENT_WIDTH - LOGO_CIRCLE_RADIUS - PDF_MARGIN * 2}
        cy={PDF_PADDING_Y + LOGO_CIRCLE_RADIUS - PDF_MARGIN}
        r={LOGO_CIRCLE_RADIUS}
        fill="grey"
        strokeWidth="0"
      />
      {/* Date */}
      <LineRect
        x={PDF_PADDING_X + MAX_CONTENT_WIDTH - LOGO_CIRCLE_RADIUS * 2 - PDF_MARGIN * 2}
        y={PDF_PADDING_Y * 3 + LOGO_CIRCLE_RADIUS}
        width={LOGO_CIRCLE_RADIUS * 2}
        height={LINE_FONT_SIZE}
      />
      {/* Content */}
      {getLines(PDF_MARGIN + LOGO_CIRCLE_RADIUS + PDF_PADDING_Y * 4)}
      <Pages pageCount={pageCount} />
    </svg>
  );
};

interface PagesProps {
  pageCount: number;
}

const Pages = ({ pageCount }: PagesProps) =>
  new Array(pageCount - 1).fill(undefined).map((_, index) => <Page key={index.toString()} page={index + 1} />);

interface PageProps {
  page: number;
}

const Page = ({ page }: PageProps) => {
  const offset = PDF_PAGE_HEIGHT * page + PAGE_GAP * page;

  return (
    <>
      {/* Page background */}
      <rect x={0} y={offset} width="100%" height={PDF_PAGE_HEIGHT} fill="white" strokeWidth="0" />
      {/* Content */}
      {getLines(offset)}
    </>
  );
};

interface LineRectProps {
  x: number;
  y: number;
  width: number;
  height: number;
}

const LineRect = ({ x, y, width, height }: LineRectProps) => (
  <rect x={x} y={y} width={width} height={height} fill="grey" strokeWidth="0" />
);
