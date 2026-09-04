Feature: Tag-expression-scoped hooks

  Scenario: A checkout with no tags at all
    When the scenario records "no-tags"
    Then the hook log reads "always,step:no-tags"

  @REQ-EC-027
  @db
  Scenario: A database-backed checkout is scoped by a bare tag expression
    When the scenario records "db-only"
    Then the hook log reads "always,db-scoped,compound-scoped,step:db-only"

  @db
  @slow
  Scenario: A slow database-backed checkout is excluded by the compound expression's "not @slow"
    When the scenario records "db-and-slow"
    Then the hook log reads "always,db-scoped,step:db-and-slow"
