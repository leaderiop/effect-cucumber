# DELIBERATE: the trailing "|" is omitted from BOTH the Examples header row and
# the body row below. Do not "fix" this and do not let an editor or formatter
# add the pipes back. Omitting it from the body row alone raises the loud
# AstBuilderException pinned by parse-failed-inconsistent-cells.feature; with it
# missing from both lines the cell counts stay consistent, the last column is
# dropped in silence, and <b> survives as literal step text. That silent drop is
# the whole reason this fixture exists (cucumber/gherkin#22, still open).
Feature: an Examples column dropped in silence

  Scenario Outline: outline
    Given <a> and <b>

    Examples:
      | a | b
      | 1 | 2
