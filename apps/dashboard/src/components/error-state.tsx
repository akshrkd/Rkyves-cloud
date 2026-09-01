import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription>{message ?? "An unexpected error occurred."}</CardDescription>
      </CardHeader>
      {onRetry && (
        <CardContent>
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
