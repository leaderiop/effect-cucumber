Feature: one step carrying a DataTable written before its DocString

  Scenario: both arguments on a single step, in the reverse order
    Given a step with two arguments reversed
      | a | b |
      | 1 | 2 |
      """
      the docstring content
      """
