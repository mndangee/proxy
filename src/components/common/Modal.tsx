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
  small: "w-[400px]",
  medium: "w-[560px]",
};

const ModalContents = (props: ICommonModalProps) => (
  <>
    <div className="fixed top-0 left-0 h-full w-full bg-black opacity-70" onClick={props.onClose}></div>
    <div className={`${modalSize[props.size]} rounded-4 fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white`}>
      {props.children}
      {props.showCloseBtn && (
        <div className="absolute top-6 right-6 cursor-pointer" onClick={props.onClose}>
          <CloseIcon />
        </div>
      )}
    </div>
  </>
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
