import { SearchIcon } from "outline-icons";
import * as React from "react";
import styled, { useTheme } from "styled-components";
import { s } from "@shared/styles";
import Flex from "~/components/Flex";

interface Props extends React.HTMLAttributes<HTMLInputElement> {
  name: string;
  value: string;
}

function SearchInput(
  { value, ...rest }: Props,
  ref: React.ForwardedRef<HTMLInputElement>
) {
  const theme = useTheme();
  const focusInput = React.useCallback(() => {
    if (!ref || typeof ref === "function") {
      return;
    }

    ref.current?.focus();
  }, [ref]);

  React.useEffect(() => {
    // ensure that focus is placed at end of input on mount
    if (!ref || typeof ref === "function") {
      return;
    }

    const len = ref.current?.value.length ?? 0;
    ref.current?.setSelectionRange(len, len);
    const timeoutId = setTimeout(() => {
      focusInput();
    }, 100); // arbitrary number

    return () => {
      clearTimeout(timeoutId);
    };
  }, [ref, focusInput]);

  return (
    <Wrapper align="center">
      <StyledIcon size={46} color={theme.placeholder} onClick={focusInput} />
      <StyledInput
        {...rest}
        value={value}
        ref={ref}
        spellCheck="false"
        type="search"
        autoFocus
      />
    </Wrapper>
  );
}

const Wrapper = styled(Flex)`
  position: relative;
  margin-bottom: 8px;
`;

const StyledInput = styled.input`
  width: 100%;
  padding-block: 10px 10px;
  padding-inline: 60px 10px;
  font-size: 30px;
  font-weight: 400;
  outline: none;
  border: 0;
  background: ${s("inputBackground")};
  border-radius: 4px;
  color: ${s("text")};

  ::-webkit-search-cancel-button {
    -webkit-appearance: none;
  }
  ::-webkit-input-placeholder {
    color: ${s("placeholder")};
  }
  :-moz-placeholder {
    color: ${s("placeholder")};
  }
  ::-moz-placeholder {
    color: ${s("placeholder")};
  }
  :-ms-input-placeholder {
    color: ${s("placeholder")};
  }
`;

const StyledIcon = styled(SearchIcon)`
  position: absolute;
  inset-inline-start: 8px;
  opacity: 0.7;
`;

export default React.forwardRef(SearchInput);
