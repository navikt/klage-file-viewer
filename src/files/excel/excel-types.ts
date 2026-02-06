export type CellValue = string | number | boolean | Date;

export type Row = CellValue[];

export interface ExcelSheet {
  name: string;
  rows: Row[];
}
