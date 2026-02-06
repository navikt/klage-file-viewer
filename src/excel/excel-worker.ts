import readXlsxFile, { type CellValue, readSheetNames } from 'read-excel-file/web-worker';
import type { ExcelSheet, WorkerRequest, WorkerResponse } from './excel-worker-types';

const postResponse = (response: WorkerResponse) => {
  postMessage(response);
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { type, blob } = event.data;

  if (type !== 'parse') {
    return;
  }

  try {
    const sheetNames = await readSheetNames(blob);
    const sheets: ExcelSheet[] = [];

    for (const name of sheetNames) {
      const rows = await readXlsxFile(blob, { sheet: name, trim: false });

      sheets.push({
        name,
        rows: rows.map((row) =>
          row.map((cell): CellValue => {
            if (cell === null || cell === undefined) {
              return '';
            }

            // read-excel-file types CellValue as `typeof Date` but returns `Date` instances at runtime.
            return cell;
          }),
        ),
      });
    }

    postResponse({ type: 'result', sheets });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Kunne ikke lese Excel-filen';
    postResponse({ type: 'error', message });
  }
};
