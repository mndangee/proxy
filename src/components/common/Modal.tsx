// Assets
import CloseIcon from "@/assets/svg/CloseIcon";

// Components
import ModalPortal from "./ModalPortal";

type WidthUnitType = "px" | "%" | "em" | "vh";

export interface ICommonModalProps {
  /** 모달 오픈 유무 */
  isOpen: boolean;
  /** 모달 닫기 */
  onClose?: () => void;
  /** 모달 컨텐츠 */
  children: React.ReactNode;
  /** 모달 커스텀 className */
  className?: string;
  /** 모달 가로길이 */
  width: `${number}${WidthUnitType}` | number;
  /** 우측 상단 Close 버튼 유무 */
  showCloseBtn?: boolean;
}

const ModalContents = (props: ICommonModalProps) => {
  const width = props.width ? (typeof props.width === "string" ? props.width : `${props.width}px`) : "480px";

  return (
    <>
      <div className="bg-bg-dark fixed top-0 left-0 z-100 h-full w-full opacity-70" onClick={props.onClose}></div>
      <div
        className={` ${props.className ?? ""} rounded-4 bg-pannel-bright text-font-normal shadow-lv3 fixed top-1/2 left-1/2 z-[100] -translate-x-1/2 -translate-y-1/2`}
        style={{ width }}
      >
        {props.children}
        {props.showCloseBtn && (
          <div className="[&_path]:fill-font-normal absolute top-4 right-4 cursor-pointer" onClick={props.onClose}>
            <CloseIcon />
          </div>
        )}
      </div>
    </>
  );
};

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
