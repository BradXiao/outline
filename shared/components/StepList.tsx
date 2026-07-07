import type { ReactNode } from "react";
import styled from "styled-components";
import { s } from "../styles";
import Text from "./Text";

export type StepListStep = {
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
};

export type StepListProps = {
  className?: string;
  title?: ReactNode;
  steps: StepListStep[];
};

/**
 * Renders a numbered sequence of steps.
 *
 * @param props.title - Optional heading shown above the list.
 * @param props.steps - Ordered steps with a required title and optional subtitle and description.
 * @param props.className - Optional styled-components class name.
 * @returns The rendered step list, or null when no steps are supplied.
 */
function StepList({ title, steps, className }: StepListProps) {
  if (!steps.length) {
    return null;
  }

  return (
    <Root className={className}>
      {title && <StepTitle>{title}</StepTitle>}
      <List>
        {steps.map((step, index) => (
          <StepItem key={`step-${index}`}>
            <StepMarker aria-hidden="true">{index + 1}</StepMarker>
            <StepContent>
              <ItemTitle>{step.title}</ItemTitle>
              {step.subtitle && <ItemSubtitle>{step.subtitle}</ItemSubtitle>}
              {step.description && (
                <ItemDescription>{step.description}</ItemDescription>
              )}
            </StepContent>
          </StepItem>
        ))}
      </List>
    </Root>
  );
}

export default StepList;

const Root = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const StepTitle = styled(Text).attrs({ size: "large", weight: "bold" })`
  display: block;
  margin: 0;
`;

const List = styled.ol`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const StepItem = styled.li`
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 0;

  & + & {
    margin-top: 20px;
  }

  &:not(:last-child)::after {
    content: "";
    position: absolute;
    left: 11px;
    top: 30px;
    width: 1px;
    bottom: -20px;
    background-image: radial-gradient(
      circle closest-side,
      #c52d2d 100%,
      transparent 100%
    );
    background-position: center top;
    background-repeat: repeat-y;
    background-size: 1px 6px;
  }
`;

const StepMarker = styled.div`
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid ${s("divider")};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  font-size: 10px;
`;

const StepContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 24px;
  padding-top: 1px;
`;

const ItemTitle = styled(Text).attrs({ weight: "bold" })`
  display: block;
  margin: 0;
  line-height: 1.35;
  font-size: 1.125em;
`;

const ItemSubtitle = styled(Text).attrs({
  italic: true,
  type: "secondary",
  size: "small",
})`
  display: block;
  margin: -2px 0 0;
`;

const ItemDescription = styled.div`
  color: ${s("text")};
  line-height: 1.6;

  &:empty {
    display: none;
  }

  > :first-child {
    margin-top: 0;
  }

  > :last-child {
    margin-bottom: 0;
  }
`;
