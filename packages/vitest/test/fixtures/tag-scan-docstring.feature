@fixture-docstring
Feature: a feature whose DocString contains an at-sign line

  Scenario: a DocString line beginning with @ is prose, not a tag
    Given a payload:
      """
      @fixture-not-a-tag
      the line above is the body of a DocString and must never be declared
      """
    Then it works
