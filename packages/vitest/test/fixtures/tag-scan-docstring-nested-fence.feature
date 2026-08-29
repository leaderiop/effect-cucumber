Feature: a feature whose DocString contains an embedded, unbalanced fence line

  Scenario: a bare backtick-fence line inside a triple-quote DocString is prose, not a closer
    Given a payload:
      """
      before code block:
      ```
      example code
      ```
      after code block, still inside docstring:
      ```
      unterminated example remains open
      """
    Then it works

  @fixture-nested-fence
  Scenario: this tag must still be captured after the DocString above
    Given a step
