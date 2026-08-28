Feature: one outline with two Examples blocks

  Scenario Outline: outline
    Given <n>

    @blockone
    Examples:
      | n |
      | 1 |
      | 2 |

    @blocktwo
    Examples:
      | n |
      | 3 |
