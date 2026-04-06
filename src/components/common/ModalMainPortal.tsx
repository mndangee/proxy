// React
import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface IProps {
  children: ReactNode;
}

function getContainer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("app-main") ?? document.getElementById("modal");
}

/** `#app-main`이 있으면 그 안(내비 제외 영역), 없으면 `#modal` */
export default function ModalMainPortal(props: IProps) {
  const [element, setElement] = useState<HTMLElement | null>(() => getContainer());

  useEffect(() => {
    if (!element) setElement(getContainer());
  }, [element]);

  return element ? createPortal(props.children, element) : null;
}
