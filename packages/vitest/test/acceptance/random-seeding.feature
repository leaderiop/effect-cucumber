Feature: Deterministic per-Scenario Random seeding

  @REQ-EC-024
  Scenario Outline: A random value is captured
    When a random value between 1 and 1000000 is captured for the "<label>" row
    Then the captured value for the "<label>" row matches its own independently-derived expected value

    Examples:
      | label  |
      | first  |
      | second |

  Scenario: Two Outline rows captured different random values
    Then the two captured random values are different
