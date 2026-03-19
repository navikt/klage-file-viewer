import type { ReflowParagraph } from '@/files/pdf/selection/copy/analyze-reflow';

export const PAGES_EXPECTED_OUTPUT: ReflowParagraph[][] = [
  // Page 1
  [
    {
      role: 'paragraph',
      alignment: 'right',
      lines: [[{ text: 'Dato: 19. mars 2026', bold: false, italic: false }]],
    },
    {
      role: 'paragraph',
      alignment: 'left',
      lines: [
        [
          { text: 'Saken gjelder: ', bold: true, italic: false },
          { text: 'FATTET ØRN MUSKEL', bold: false, italic: false },
        ],
        [
          { text: 'Fødselsnummer: ', bold: true, italic: false },
          { text: '148288 97927', bold: false, italic: false },
        ],
        [
          { text: 'Klager: ', bold: true, italic: false },
          { text: 'FORDEKT MATVARE', bold: false, italic: false },
        ],
        [
          { text: 'Fullmektig: ', bold: true, italic: false },
          { text: 'FORDEKT MATVARE', bold: false, italic: false },
        ],
        [
          { text: 'Saksnummer: ', bold: true, italic: false },
          { text: '9570', bold: false, italic: false },
        ],
      ],
    },
    {
      role: 'heading',
      headingLevel: 1,
      alignment: 'left',
      lines: [
        [
          {
            text: 'Under er to avsnitt, ett med soft-break (linjeskift uten nytt avsnitt) og ett som knekker over flere linjer naturlig',
            bold: true,
            italic: false,
          },
        ],
      ],
    },
    {
      role: 'paragraph',
      alignment: 'left',
      lines: [
        [{ text: 'En helt plain setning, men her er et soft-break', bold: false, italic: false }],
        [{ text: 'her fortsetter teksten på neste linje etter soft-break.', bold: false, italic: false }],
        [{ text: 'Selv om denne teksten går over flere linjer,', bold: false, italic: false }],
        [{ text: 'er ikke linjene lange nok til å knekke naturlig.', bold: false, italic: false }],
      ],
    },
    {
      role: 'paragraph',
      alignment: 'left',
      lines: [[{ text: 'Dette er ikke en overskrift, bare et avsnitt med bold tekst', bold: true, italic: false }]],
    },
    {
      role: 'paragraph',
      alignment: 'left',
      lines: [
        [
          {
            text: 'Men dette er et nytt avsnitt. Her er teksten så lang at den knekker over flere linjer naturlig, i motsetning til avsnittet over hvor linjene ble delt opp ved å trykke på Shift+Enter.',
            bold: false,
            italic: false,
          },
        ],
      ],
    },
    {
      role: 'heading',
      headingLevel: 2,
      alignment: 'left',
      lines: [[{ text: 'Under er det tre avsnitt med forskjellig tekstformatering', bold: true, italic: false }]],
    },
    {
      role: 'paragraph',
      alignment: 'left',
      lines: [
        [
          { text: 'En setning med ', bold: false, italic: false },
          { text: 'bold tekst', bold: true, italic: false },
          { text: '.', bold: false, italic: false },
        ],
      ],
    },
    {
      role: 'paragraph',
      alignment: 'left',
      lines: [
        [
          { text: 'Et nytt avsnitt med ', bold: false, italic: false },
          { text: 'kursiv tekst', bold: false, italic: true },
          { text: '.', bold: false, italic: false },
        ],
      ],
    },
    {
      role: 'paragraph',
      alignment: 'left',
      lines: [[{ text: 'Enda et nytt avsnitt med understreket tekst.', bold: false, italic: false }]],
    },
    {
      role: 'paragraph',
      alignment: 'left',
      lines: [[{ text: 'Under er det flere typer lister', bold: true, italic: false }]],
    },
    {
      role: 'list-item',
      listKind: 'unordered',
      alignment: 'left',
      lines: [[{ text: 'Punktliste, punkt 1.', bold: false, italic: false }]],
    },
    {
      role: 'list-item',
      listKind: 'unordered',
      alignment: 'left',
      lines: [[{ text: 'Punktliste, punkt 2.', bold: false, italic: false }]],
    },
    {
      role: 'list-item',
      listKind: 'unordered',
      alignment: 'left',
      lines: [[{ text: 'Punktliste, punkt 3.', bold: false, italic: false }]],
    },
    {
      role: 'list-item',
      listKind: 'ordered',
      alignment: 'left',
      lines: [[{ text: 'Nummert liste, punkt 1.', bold: false, italic: false }]],
    },
    {
      role: 'list-item',
      listKind: 'ordered',
      alignment: 'left',
      lines: [[{ text: 'Nummert liste, punkt 2.', bold: false, italic: false }]],
    },
    {
      role: 'list-item',
      listKind: 'ordered',
      alignment: 'left',
      lines: [[{ text: 'Nummert liste, punkt 3.', bold: false, italic: false }]],
    },
  ],

  // Page 2
  [
    {
      role: 'list-item',
      listKind: 'ordered',
      alignment: 'left',
      lines: [
        [
          { text: 'Lorem Ipsum', bold: true, italic: false },
          {
            text: " is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book.",
            bold: false,
            italic: false,
          },
        ],
      ],
    },
    {
      role: 'list-item',
      listKind: 'ordered',
      alignment: 'left',
      lines: [
        [
          { text: 'It has survived', bold: false, italic: true },
          {
            text: ' not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged.',
            bold: false,
            italic: false,
          },
        ],
      ],
    },
    {
      role: 'paragraph',
      alignment: 'left',
      lines: [[{ text: 'Avsnittet under er rykket inn', bold: true, italic: false }]],
    },
    {
      role: 'paragraph',
      alignment: 'left',
      lines: [
        [
          {
            text: 'Dette avsnittet er rykket inn ett hakk. Dette avsnittet er rykket inn ett hakk. Dette avsnittet er rykket inn ett hakk. Dette avsnittet er rykket inn ett hakk. Dette avsnittet er rykket inn ett hakk. Dette avsnittet er rykket inn ett hakk.',
            bold: false,
            italic: false,
          },
        ],
      ],
    },
    {
      role: 'paragraph',
      alignment: 'center',
      lines: [[{ text: 'Dette avsnittet er midtstilt.', bold: false, italic: false }]],
    },
    {
      role: 'paragraph',
      alignment: 'right',
      lines: [[{ text: 'Dette avsnittet er høyrestilt.', bold: false, italic: false }]],
    },
    {
      role: 'paragraph',
      alignment: 'left',
      lines: [
        [{ text: 'Celle A1 Celle B1 Celle C1', bold: false, italic: false }],
        [{ text: 'Celle A2 Celle B2 Celle C2', bold: false, italic: false }],
      ],
    },
    {
      role: 'paragraph',
      alignment: 'left',
      lines: [
        [{ text: 'D. Nordmann C. S.', bold: false, italic: false }],
        [{ text: 'rådgiver avdelingsdirektør/saksbehandler', bold: false, italic: false }],
      ],
    },
  ],
];
