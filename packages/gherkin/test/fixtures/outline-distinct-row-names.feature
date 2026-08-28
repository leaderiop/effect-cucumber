Feature: an outline whose row names all differ from its own title

  Scenario Outline: outline <name>
    Given a step for <name>

    Examples:
      | name |
      | a    |
      | b    |
