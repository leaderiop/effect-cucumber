Feature: a Background placeholder is never interpolated under an outline

  Background:
    Given a <name>

  Scenario Outline: outline
    When I use <name>

    Examples:
      | name  |
      | alice |
