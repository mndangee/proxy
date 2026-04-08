// React
import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface IProps {
  children: ReactNode;
}

function getModalRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("modal");
}

export default function ModalPortal(props: IProps) {
  const [element, setElement] = useState<HTMLElement | null>(getModalRoot);

  useEffect(() => {
    if (element) return;
    const el = getModalRoot();
    if (el) setElement(el);
  }, [element]);

  return element ? createPortal(props.children, element) : null;
}
