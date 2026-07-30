export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-16 text-center">
      <p className="text-sm text-zinc-500">{message}</p>
    </div>
  );
}
