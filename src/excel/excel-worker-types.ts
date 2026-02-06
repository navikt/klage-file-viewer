import type { Row } from 'read-excel-file/web-worker';

export interface ExcelSheet {
  name: string;
  rows: Row[];
}

export interface ParseMessage {
  type: 'parse';
  blob: Blob;
}

export interface ResultMessage {
  type: 'result';
  sheets: ExcelSheet[];
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type WorkerRequest = ParseMessage;
export type WorkerResponse = ResultMessage | ErrorMessage;
