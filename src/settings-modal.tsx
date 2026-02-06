import { Modal, Switch } from '@navikt/ds-react';
import { useFileViewerConfig } from '@/context';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
  const { invertColors, setInvertColors } = useFileViewerConfig();

  return (
    <Modal open={open} onClose={onClose} header={{ heading: 'Innstillinger' }} width="small" closeOnBackdropClick>
      <Modal.Body>
        <Switch
          checked={invertColors}
          onChange={(e) => {
            setInvertColors(e.target.checked);
          }}
        >
          Inverter PDF-farger i mørk modus
        </Switch>
      </Modal.Body>
    </Modal>
  );
};
