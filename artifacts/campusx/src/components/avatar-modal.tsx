import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface AvatarModalProps {
  open: boolean;
  onClose: () => void;
  avatarUrl?: string | null;
  name: string;
}

export function AvatarModal({ open, onClose, avatarUrl, name }: AvatarModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm p-0 bg-transparent border-none shadow-none flex items-center justify-center">
        <div className="relative flex flex-col items-center gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="rounded-full w-64 h-64 object-cover border-4 border-primary/40 shadow-2xl shadow-primary/20"
            />
          ) : (
            <div className="rounded-full w-64 h-64 flex items-center justify-center bg-gradient-to-br from-pink-500 to-orange-500 border-4 border-primary/40 shadow-2xl shadow-primary/20 text-white text-6xl font-black">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-white font-semibold text-lg drop-shadow-lg">{name}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
