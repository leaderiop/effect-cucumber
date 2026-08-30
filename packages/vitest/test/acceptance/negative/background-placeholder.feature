Feature: a Background placeholder is never interpolated under an outline

  Background:
    Given a <name>

  @REQ-EC-003
  Scenario Outline: the outline whose Background placeholder survives compilation
    When I use <name>

    Examples:
      | name  |
      | alice |
