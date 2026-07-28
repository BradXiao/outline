import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { closeHistory } from "@shared/editor/lib/closeHistory";
import { RemoveScroll } from "react-remove-scroll";
import styled from "styled-components";
import EventBoundary from "@shared/components/EventBoundary";
import { collapseSelection } from "@shared/editor/commands/collapseSelection";
import { isTableSelected } from "@shared/editor/queries/table";
import { ColumnSelection } from "@shared/editor/selection/ColumnSelection";
import { RowSelection } from "@shared/editor/selection/RowSelection";
import { EditorStyleHelper } from "@shared/editor/styles/EditorStyleHelper";
import type { MenuItem } from "@shared/editor/types";
import { useTranslation } from "react-i18next";
import Scrollable from "~/components/Scrollable";
import { toMenuItems, toMobileMenuItems } from "~/components/Menu/transformer";
import * as Components from "~/components/primitives/components/Menu";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "~/components/primitives/Drawer";
import { MenuProvider } from "~/components/primitives/Menu/MenuContext";
import type { MenuItem as TMenuItem, MenuItemWithChildren } from "~/types";
import useEventListener from "~/hooks/useEventListener";
import useMobile from "~/hooks/useMobile";
import { mapMenuItems } from "../menus/mapMenuItems";
import { useEditor } from "./EditorContext";
import { useInlineMenuAnchor } from "./useInlineMenuAnchor";

const TABLE_GRIP_SELECTOR = [
  `.${EditorStyleHelper.tableGrip}`,
  `.${EditorStyleHelper.tableGripRow}`,
  `.${EditorStyleHelper.tableGripColumn}`,
].join(", ");

type Props = {
  items: MenuItem[];
  /** Whether the document is right-to-left. */
  rtl: boolean;
};

// The virtual anchor is an invisible zero-size element; the hook positions it
// over the selection and Radix anchors the menu to it.
const anchorStyle: React.CSSProperties = {
  position: "fixed",
  width: 0,
  height: 0,
};

/**
 * Renders a selection-toolbar menu inline — a vertical menu anchored to the
 * selection with no trigger button — by holding a Radix dropdown `open`
 * against a virtual anchor positioned over the selection. Radix provides the
 * positioning, collision handling, submenus, and keyboard navigation. Page
 * scroll is locked while open (via RemoveScroll, as Radix does for modal
 * menus) without enabling Radix's modal mode, which conflicts with the menu
 * being opened by an editor selection rather than a trigger.
 */
const InlineMenu: React.FC<Props> = ({ items, rtl }) => {
  const { t } = useTranslation();
  const { commands, view } = useEditor();
  const { state } = view;
  const isMobile = useMobile();

  const executeCommand = React.useCallback(
    (name: "deleteTable" | "deleteColumn" | "deleteRow") => {
      const command = commands[name];

      if (!command) {
        return false;
      }

      closeHistory(view);
      command();
      closeHistory(view);

      return true;
    },
    [commands, view]
  );
  const {
    ref: anchorRef,
    key: anchorKey,
    side,
    align,
    sideOffset,
  } = useInlineMenuAnchor(rtl);

  const mapped = React.useMemo(
    () => mapMenuItems(items, commands, view, state),
    [items, commands, view, state]
  );

  const preventFocus = React.useCallback((ev: Event) => {
    ev.preventDefault();
  }, []);

  const handleKeyDown = React.useCallback(
    (ev: KeyboardEvent) => {
      if (isMobile || !anchorKey) {
        return;
      }

      if (ev.key !== "Backspace" && ev.key !== "Delete") {
        return;
      }

      if (
        ev.target instanceof HTMLElement &&
        (ev.target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(ev.target.tagName))
      ) {
        return;
      }

      const { selection } = view.state;
      let handled = false;

      if (isTableSelected(view.state)) {
        handled = executeCommand("deleteTable");
      } else if (
        selection instanceof ColumnSelection &&
        selection.isColSelection()
      ) {
        handled = executeCommand("deleteColumn");
      } else if (
        selection instanceof RowSelection &&
        selection.isRowSelection()
      ) {
        handled = executeCommand("deleteRow");
      }

      if (!handled) {
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();
    },
    [anchorKey, executeCommand, isMobile, view]
  );

  useEventListener("keydown", handleKeyDown, window, { capture: true });

  // Dismiss the menu by collapsing the selection so the toolbar stops matching.
  // Clicks on table grips must not collapse first — Shift/Ctrl-click expand needs
  // the existing CellSelection, and the grip handler updates selection itself.
  const handleDismiss = React.useCallback(() => {
    collapseSelection()(view.state, view.dispatch);
  }, [view]);

  const handleInteractOutside = React.useCallback(
    (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(TABLE_GRIP_SELECTOR)) {
        event.preventDefault();
        return;
      }
      handleDismiss();
    },
    [handleDismiss]
  );

  if (isMobile) {
    return (
      <InlineMenuDrawer
        items={mapped}
        ariaLabel={t("Options")}
        onDismiss={handleDismiss}
      />
    );
  }

  return (
    <MenuProvider variant="dropdown">
      <DropdownMenuPrimitive.Root
        key={anchorKey}
        open={!!anchorKey}
        modal={false}
      >
        <DropdownMenuPrimitive.Trigger asChild>
          <div ref={anchorRef} aria-hidden style={anchorStyle} />
        </DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            side={side}
            align={align}
            sideOffset={sideOffset}
            collisionPadding={6}
            aria-label={t("Options")}
            onCloseAutoFocus={preventFocus}
            onInteractOutside={handleInteractOutside}
            onEscapeKeyDown={handleDismiss}
            asChild
          >
            <RemoveScroll as={Slot} allowPinchZoom>
              <Components.MenuContent
                maxHeightVar="--radix-dropdown-menu-content-available-height"
                transformOriginVar="--radix-dropdown-menu-content-transform-origin"
                hiddenScrollbars
              >
                <EventBoundary>{toMenuItems(mapped)}</EventBoundary>
              </Components.MenuContent>
            </RemoveScroll>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    </MenuProvider>
  );
};

// Time for the drawer's close animation to play before the selection is
// collapsed (which unmounts the menu).
const DRAWER_CLOSE_MS = 500;

type InlineMenuDrawerProps = {
  items: TMenuItem[];
  ariaLabel: string;
  /** Collapse the selection so the toolbar stops rendering the menu. */
  onDismiss: () => void;
};

/**
 * Mobile presentation of the inline menu: a bottom drawer with submenu drill-in,
 * matching the other menus. The menu is held open while the selection matches;
 * closing animates the drawer out before collapsing the selection.
 */
function InlineMenuDrawer({
  items,
  ariaLabel,
  onDismiss,
}: InlineMenuDrawerProps) {
  const [open, setOpen] = React.useState(true);
  const [submenuName, setSubmenuName] = React.useState<string>();

  const close = React.useCallback(() => {
    setOpen(false);
    setTimeout(() => {
      setSubmenuName(undefined);
      onDismiss();
    }, DRAWER_CLOSE_MS);
  }, [onDismiss]);

  const handleOpenChange = React.useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        close();
      }
    },
    [close]
  );

  const menuItems = React.useMemo(() => {
    if (!items.length || !submenuName) {
      return items;
    }
    const submenu = items.find(
      (item) => item.type === "submenu" && item.title === submenuName
    ) as MenuItemWithChildren | undefined;
    return submenu?.items ?? items;
  }, [items, submenuName]);

  const content = toMobileMenuItems(menuItems, close, setSubmenuName);

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent aria-label={ariaLabel} aria-describedby={undefined}>
        <DrawerTitle hidden>{ariaLabel}</DrawerTitle>
        <StyledScrollable hiddenScrollbars>{content}</StyledScrollable>
      </DrawerContent>
    </Drawer>
  );
}

const StyledScrollable = styled(Scrollable)`
  max-height: 75vh;
`;

export default InlineMenu;
