import type { TFunction } from "i18next";
import { observer } from "mobx-react";
import { DoneIcon } from "outline-icons";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import type Document from "~/models/Document";
import CircularProgressBar from "~/components/CircularProgressBar";
import usePrevious from "~/hooks/usePrevious";
import { bounceIn } from "~/styles/animations";
import Flex from "./Flex";

type Props = {
  document: Document;
};

function getMessage(
  t: TFunction,
  total: number,
  completed: number,
  inProgress: number
): string {
  let base: string;
  if (completed === 0) {
    base = t(`{{ total }} task`, {
      total,
      count: total,
    });
  } else if (completed === total) {
    base = t(`{{ completed }} task done`, {
      completed,
      count: completed,
    });
  } else {
    base = t(`{{ completed }} of {{ total }} tasks`, {
      total,
      completed,
    });
  }

  if (inProgress > 0 && completed < total) {
    base += ` (${t(`{{ count }} in progress`, { count: inProgress })})`;
  }

  return base;
}

function DocumentTasks({ document }: Props) {
  const { tasks, tasksPercentage } = document;
  const { t } = useTranslation();
  const theme = useTheme();
  const { completed, total, inProgress } = tasks;
  const done = completed === total;
  const previousDone = usePrevious(done);
  const message = getMessage(t, total, completed, inProgress ?? 0);

  return (
    <Flex align="center" style={{ padding: "0 1px" }} gap={2} shrink={false}>
      {completed === total ? (
        <Done
          color={theme.accent}
          size={20}
          $animated={done && previousDone === false}
        />
      ) : (
        <CircularProgressBar percentage={tasksPercentage} label={message} />
      )}
      {message}
    </Flex>
  );
}

const Done = styled(DoneIcon)<{ $animated: boolean }>`
  margin: -1px;
  animation: ${(props) => (props.$animated ? bounceIn : "none")} 600ms;
  transform-origin: center center;
`;

export default observer(DocumentTasks);
