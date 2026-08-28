Feature: a Background placeholder survives inside step arguments too

  Background:
    Given a background table
      | <x> |
    And a background docstring
      """
      the value is <x>
      """

  Scenario Outline: outline
    When I use a scenario table
      | <x> |

    Examples:
      | x |
      | 1 |
