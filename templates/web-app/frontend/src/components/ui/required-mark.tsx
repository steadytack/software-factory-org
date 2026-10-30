/** The asterisk after a required field's label. Decorative: the input itself carries `required`. */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-destructive-fg">
      *
    </span>
  );
}
