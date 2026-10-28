// More (owner, managers) and Me (staff, riders): grouped lists of everything not in the bottom
// nav, only the rows this login can open (design review d12, wireframe More). Me starts with the
// person's own card, which opens the Account sheet.
import { ListGroup, ListRow } from '../ui/list-row';
import { InitialsAvatar } from '../ui/avatar';
import { APP_VERSION } from '../../utils/appVersion';
import { useT } from '../../utils/i18n';
import type { NavModel } from './navConfig';
import { NAV_ICONS } from './icons';
import { formatHash } from './router';

export function MorePage({
  nav,
  isMe,
  name,
  roleLine,
  onOpen,
  onAccount,
}: {
  nav: NavModel;
  isMe: boolean;
  name: string;
  roleLine: string;
  onOpen: (path: string) => void;
  onAccount: () => void;
}) {
  const { t, lang } = useT();
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 py-4 lg:px-8 lg:py-6" lang={lang}>
      {isMe && (
        <ListGroup>
          <ListRow leading={<InitialsAvatar name={name} size={40} />} title={name} subtitle={roleLine} onClick={onAccount} />
        </ListGroup>
      )}
      {nav.more.map((group) => (
        <ListGroup key={group.title} overline={t(group.title)}>
          {group.items.map((path) => {
            const dest = nav.destinations[path];
            return (
              <ListRow
                key={path}
                icon={NAV_ICONS[dest.icon]}
                title={t(dest.label)}
                href={formatHash({ path, params: {} })}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                  event.preventDefault();
                  onOpen(path);
                }}
              />
            );
          })}
        </ListGroup>
      ))}
      <p className="pb-2 text-center text-caption text-text-3">{t('more.version', { v: APP_VERSION })}</p>
    </div>
  );
}
