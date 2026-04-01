interface Props {
  className?: string
}

export function DigiIcon({ className }: Props) {
  return (
    <img
      src={import.meta.env.BASE_URL + 'Logo Digilityx (1).jpeg'}
      alt=""
      className={className}
      style={{ borderRadius: '2px' }}
    />
  )
}
