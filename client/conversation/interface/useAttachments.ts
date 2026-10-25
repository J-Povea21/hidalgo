import { useState } from 'preact/hooks';
import { toast } from '@client/common/interface/ui/parts.tsx';
import { MAX_PER_MESSAGE } from '@client/conversation/domain/attachment.rules.ts';

/** The images attached to the message being written: at most MAX_PER_MESSAGE, each shrunk before it's kept. */
export function useAttachments(shrinkImages: (files: File[]) => Promise<string[]>) {
  const [images, setImages] = useState<string[]>([]);

  const attach = async (files: FileList | File[]) => {
    const imageFiles = [...files].filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      return;
    }
    const roomLeft = MAX_PER_MESSAGE - images.length;
    if (roomLeft <= 0) {
      toast(`Up to ${MAX_PER_MESSAGE} images per message`);
      return;
    }
    const shrunk = await shrinkImages(imageFiles.slice(0, roomLeft));
    // Two quick pastes can both be shrinking at once: the limit is applied again to what's attached by then.
    let kept = 0;
    setImages((attached) => {
      const withNew = [...attached, ...shrunk].slice(0, MAX_PER_MESSAGE);
      kept = withNew.length - attached.length;
      return withNew;
    });
    toast(attachedMessage(kept, imageFiles.length));
  };

  const remove = (position: number) =>
    setImages((attached) => attached.filter((_, otherPosition) => otherPosition !== position));

  return { images, setImages, attach, remove };
}

function attachedMessage(kept: number, offered: number): string {
  if (kept < offered) {
    return `Attached ${kept}; up to ${MAX_PER_MESSAGE} per message`;
  }
  return `${kept} image${kept > 1 ? 's' : ''} attached`;
}
