"use client";

interface IProps {
  opacity?: boolean;
  absolute?: boolean;
  className?: string;
}

export default function Loader({ opacity = true, absolute, className }: IProps) {
  const loaderDefaultStyle = `${absolute ? "absolute" : "fixed"} ${className} h-full w-full`;
  return (
    <div className={`${loaderDefaultStyle} cn-center left-0 top-0 z-[200]`}>
      <div className={`${loaderDefaultStyle} ${opacity && "opacity-70"} bg-bg-dark`} />
      <span className="loader"></span>
    </div>
  );
}
