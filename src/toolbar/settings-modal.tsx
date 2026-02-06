import { HelpText, Modal, Switch } from '@navikt/ds-react';
import { useFileViewerConfig } from '@/context';
import { ScaleSettings } from '@/scale/scale';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
  const { invertColors, setInvertColors, smoothScrolling, setSmoothScrolling } = useFileViewerConfig();

  return (
    <Modal
      open={open}
      onClose={onClose}
      header={{ heading: 'Innstillinger' }}
      className="w-fit max-w-[calc(100%-2rem)]"
      closeOnBackdropClick
    >
      <Modal.Body>
        <Switch
          checked={invertColors}
          onChange={(e) => {
            setInvertColors(e.target.checked);
          }}
        >
          <div className="flex flex-row items-center gap-2">
            <span>Inverter PDF-farger i mørk modus</span>
            <HelpText>Har bare effekt i mørk modus. Gjør alle PDFer mørke.</HelpText>
          </div>
        </Switch>

        <Switch
          checked={smoothScrolling}
          onChange={(e) => {
            setSmoothScrolling(e.target.checked);
          }}
        >
          Animert/jevn skrolling
        </Switch>

        <ScaleSettings />
      </Modal.Body>
    </Modal>
  );
};
