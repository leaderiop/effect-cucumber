Feature: an outline whose row names are all identical

  Scenario Outline: same title
    Given a step for <n>

    Examples:
      | n |
      | 1 |
      | 2 |
      | 3 |
