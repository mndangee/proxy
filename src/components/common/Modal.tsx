// Assets
import CloseIcon from "@/assets/svg/CloseIcon";

// Internal
import ModalMainPortal from "./ModalMainPortal";
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
  /**
   * true이면 `#app-main`이 있을 때 그 영역 기준 absolute 오버레이(내비 제외 가운데).
   * 없으면 기존처럼 `#modal` + fixed.
   */
  anchorMain?: boolean;
}

const modalSize: Record<ModalSizeType, string> = {
  small: "max-w-[400px]",
  medium: "max-w-[560px]",
};

const ModalContents = (props: ICommonModalProps) => {
  const overlay = props.anchorMain ? "absolute" : "fixed";
  return (
  <div className={`${overlay} inset-0 z-[1000] flex items-center justify-center p-6`}>
    <button
      type="button"
      className={`${overlay} inset-0 bg-black/70`}
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
};

export default function Modal(props: ICommonModalProps) {
  const isStorybook = typeof window !== "undefined" && window.self !== window.top;
  const useMain =
    Boolean(props.anchorMain) && typeof document !== "undefined" && document.getElementById("app-main") != null;

  return (
    props.isOpen &&
    (isStorybook ? (
      <ModalContents {...props} anchorMain={false} />
    ) : useMain ? (
      <ModalMainPortal>
        <ModalContents {...props} anchorMain />
      </ModalMainPortal>
    ) : (
      <ModalPortal>
        <ModalContents {...props} anchorMain={false} />
      </ModalPortal>
    ))
  );
}
