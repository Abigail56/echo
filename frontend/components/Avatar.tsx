export default function Avatar({
  color = 'cyan',
  style = 'presence',
  size = 'large',
  name = 'ECHO',
}: {
  color?: string;
  style?: string;
  size?: 'small' | 'large';
  name?: string;
}) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'E';
  return <div
    role="img"
    aria-label={`${name} digital identity`}
    className={`avatar avatar-${color} avatar-${size} avatar-${style}`}
  >
    <span className="avatar-initials">{initials}</span>
    <span className="avatar-presence-mark" aria-hidden="true" />
  </div>;
}
