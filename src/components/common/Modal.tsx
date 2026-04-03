// Assets
import CloseIcon from "@/assets/svg/CloseIcon";

// Internal
import ModalPortal from "./ModalPortal";

type ModalSizeType = "small" | "medium";

export interface ICommonModalProps {
  /** 모달 오픈 유무 */
  isOpen: boolean;
  /** 모달 닫기 */
  onClose?: () => void;
  /** 모달 컨텐츠 */
  children: React.ReactNode;
  /** 모달 사이즈 */
  size: ModalSizeType;
  /** 우측 상단 Close 버튼 유무 */
  showCloseBtn?: boolean;
}

const modalSize: Record<ModalSizeType, string> = {
  small: "max-w-[400px]",
  medium: "max-w-[560px]",
};

const ModalContents = (props: ICommonModalProps) => (
  <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
    <button
      type="button"
      className="absolute inset-0 bg-black/70"
      onClick={props.onClose}
      aria-label="닫기"
    />
    <div
      role="dialog"
      aria-modal="true"
      className={`${modalSize[props.size]} border-border-enabled relative z-[1] w-full overflow-y-auto rounded-4 border bg-background-white shadow-lg`}
      onClick={(e) => e.stopPropagation()}
    >
      {props.children}
      {props.showCloseBtn && (
        <button type="button" className="absolute top-6 right-6 cursor-pointer rounded p-1 text-label-assistant hover:bg-background-secondary-weak hover:text-label-neutral" onClick={props.onClose} aria-label="닫기">
          <CloseIcon />
        </button>
      )}
    </div>
  </div>
);

export default function Modal(props: ICommonModalProps) {
  const isStorybook = typeof window !== "undefined" && window.self !== window.top;

  return (
    props.isOpen &&
    (isStorybook ? (
      <ModalContents {...props} />
    ) : (
      <ModalPortal>
        <ModalContents {...props} />
      </ModalPortal>
    ))
  );
}
