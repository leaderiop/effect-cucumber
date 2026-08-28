Feature: one step carrying both a DocString and a DataTable

  Scenario: both arguments on a single step
    Given a step with two arguments
      """
      the docstring content
      """
      | a | b |
      | 1 | 2 |
