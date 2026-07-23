import { Link, useRouteError, isRouteErrorResponse } from "react-router";
import { Button } from "./ui/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">Page not found</h1>
      <p className="max-w-md text-sm text-gray-600">
        That link doesn’t exist in FGG Dash. Head back home and try again.
      </p>
      <Button asChild>
        <Link to="/">Back to All Systems</Link>
      </Button>
    </div>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  const is404 = isRouteErrorResponse(error) && error.status === 404;

  if (is404) {
    return <NotFoundPage />;
  }

  const message =
    error instanceof Error
      ? error.message
      : isRouteErrorResponse(error)
        ? error.statusText || `Error ${error.status}`
        : "Something went wrong";

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">Something went wrong</h1>
      <p className="max-w-md text-sm text-gray-600">{message}</p>
      <Button asChild>
        <Link to="/">Back to All Systems</Link>
      </Button>
    </div>
  );
}
