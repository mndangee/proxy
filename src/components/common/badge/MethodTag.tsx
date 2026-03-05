type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

const methodStyles: Record<HttpMethod, string> = {
  GET: 'bg-positive-100 text-positive-800',
  POST: 'bg-brand-100 text-brand-800',
  PUT: 'bg-warning-100 text-warning-800',
  DELETE: 'bg-negative-100 text-negative-800',
  PATCH: 'bg-neutral-100 text-neutral-800',
}

interface MethodTagProps {
  method: HttpMethod
  className?: string
}

export function MethodTag({ method, className = '' }: MethodTagProps) {
  return (
    <span
      className={`inline-flex items-center rounded-2 px-2 py-1 text-details font-medium ${methodStyles[method]} ${className}`}
    >
      {method}
    </span>
  )
}
