interface Props {
  children: React.ReactNode;
}

export const FileSectionContainer = ({ children }: Props) => (
  <section className="flex w-full flex-col items-center gap-1">{children}</section>
);
