type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

const methodStyles: Record<HttpMethod, string> = {
  GET: "bg-blue-100 text-blue-800",
  POST: "bg-blue-100 text-blue-800",
  PUT: "bg-blue-100 text-blue-800",
  DELETE: "bg-red-100 text-red-800",
  PATCH: "bg-gray-100 text-gray-800",
};

interface IMethodTagProps {
  method: HttpMethod;
  className?: string;
}

export default function MethodTag({ method, className = "" }: IMethodTagProps) {
  return <span className={`typo-caption-1 rounded-8 min-w-[80px] justify-center px-4 py-2 text-center font-bold ${methodStyles[method]} ${className}`}>{method}</span>;
}
