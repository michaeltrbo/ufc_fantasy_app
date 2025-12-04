-- Fix AUTO_INCREMENT for all tables in ufc_fantasy_db
-- This script temporarily disables foreign key checks to allow column modifications
-- Run this script in your MySQL database

USE ufc_fantasy_db;

-- Temporarily disable foreign key checks
SET FOREIGN_KEY_CHECKS = 0;

-- Fix User table
ALTER TABLE user MODIFY UserID INT AUTO_INCREMENT;

-- Fix League table
ALTER TABLE league MODIFY LeagueID INT AUTO_INCREMENT;

-- Fix Pick table
ALTER TABLE pick MODIFY PickID INT AUTO_INCREMENT;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Verify the changes
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    EXTRA
FROM 
    INFORMATION_SCHEMA.COLUMNS
WHERE 
    TABLE_SCHEMA = 'ufc_fantasy_db'
    AND COLUMN_KEY = 'PRI'
    AND TABLE_NAME IN ('user', 'league', 'pick')
    AND DATA_TYPE = 'int'
ORDER BY 
    TABLE_NAME, ORDINAL_POSITION;

