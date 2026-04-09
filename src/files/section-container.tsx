interface Props {
  title: string;
  children: React.ReactNode;
}

export const FileSectionContainer = ({ title, children }: Props) => (
  <section aria-label={title} className="flex w-full flex-col items-center gap-1">
    {children}
  </section>
);
